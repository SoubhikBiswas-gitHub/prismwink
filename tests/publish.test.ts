import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { promisify } from 'node:util';
import { nextVersion, parseOutputDirectory, promptVersionBump, publishPackage, PublishCancelledError, runCommand, type PublishDependencies } from '../scripts/publish-package';

const exec = promisify(execFile);

test('patch, minor and major previews follow semantic version boundaries', () => {
  assert.equal(nextVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(nextVersion('0.1.9', 'minor'), '0.2.0');
  assert.equal(nextVersion('4.7.19', 'major'), '5.0.0');
  assert.equal(nextVersion('0.65535.65535', 'major'), '1.0.0');
});

test('prereleases, leading zeros, missing components, negatives and overflow cannot enter extension versions', () => {
  for (const value of ['1.0.0-beta', '1.2', '01.2.3', '-1.2.3', '1.2.3.4', '65536.0.0', '1.0.99999999999999999999']) assert.throws(() => nextVersion(value, 'patch'), /version/i);
  for (const [value, bump] of [['1.2.65535', 'patch'], ['1.65535.0', 'minor'], ['65535.1.2', 'major']] as const) assert.throws(() => nextVersion(value, bump), /65535/);
});

test('only an explicit portable output directory option is accepted', () => {
  assert.equal(parseOutputDirectory([]), undefined);
  assert.equal(parseOutputDirectory(['--output-dir', '/tmp/package output']), '/tmp/package output');
  for (const args of [['--output-dir'], ['--version', '1.0.0'], ['--output-dir', '/tmp/a', '--output-dir', '/tmp/b']]) assert.throws(() => parseOutputDirectory(args), /Usage/);
});

test('the release prompt refuses non-interactive input without changing anything', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  await assert.rejects(promptVersionBump('0.1.0', { input, output }), /interactive terminal/);
  input.destroy(); output.destroy();
});

test('an empty Enter does not select a release and q explicitly cancels', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  let text = '';
  let promptedAgain = false;
  const output = Object.assign(new Writable({ write(chunk: Buffer, _encoding, callback) {
    text += chunk.toString();
    if (!promptedAgain && text.includes('Enter 1, 2, 3')) {
      promptedAgain = true;
      setImmediate(() => input.write('q\n'));
    }
    callback();
  } }), { isTTY: true });
  const pending = promptVersionBump('0.1.0', { input, output });
  setImmediate(() => input.write('\n'));
  assert.equal(await pending, null);
  assert.equal(promptedAgain, true);
  assert.match(text, /0\.1\.1/);
  assert.match(text, /0\.2\.0/);
  assert.match(text, /1\.0\.0/);
  input.destroy(); output.destroy();
});

interface Fixture {
  rootDirectory: string;
  outputDirectory: string;
  packagePath: string;
  lockPath: string;
  originalPackage: Buffer;
  originalLock: Buffer;
  calls: string[];
  dependencies: Partial<PublishDependencies>;
}
async function fixture(t: TestContext): Promise<Fixture> {
  const base = await mkdtemp(path.join(tmpdir(), 'prismwink-publish-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const rootDirectory = path.join(base, 'project');
  const outputDirectory = path.join(base, 'output');
  await mkdir(path.join(rootDirectory, 'dist'), { recursive: true });
  await mkdir(outputDirectory);
  const packagePath = path.join(rootDirectory, 'package.json');
  const lockPath = path.join(rootDirectory, 'package-lock.json');
  const originalPackage = Buffer.from('{\n    "name": "prismwink",\n    "version": "0.1.0",\n    "private": true\n}\n\n');
  const originalLock = Buffer.from(JSON.stringify({ name: 'prismwink', version: '0.1.0', lockfileVersion: 3, packages: { '': { name: 'prismwink', version: '0.1.0', dependencies: { example: '9.8.7' } }, 'node_modules/example': { version: '9.8.7' } } }, null, 4) + '\n\n');
  await writeFile(packagePath, originalPackage);
  await writeFile(lockPath, originalLock);
  await writeFile(path.join(rootDirectory, 'dist', 'manifest.json'), JSON.stringify({ name: 'Prismwink', version: '0.1.0', manifest_version: 3 }));
  await writeFile(path.join(rootDirectory, 'dist', 'camera.js'), 'export const camera = true;\n');
  const calls: string[] = [];
  const dependencies: Partial<PublishDependencies> = {
    log: () => {},
    run: async (command, args) => {
      calls.push([command, ...args].join(' '));
      if (args.includes('check')) {
        const metadata = JSON.parse(await readFile(packagePath, 'utf8')) as { version: string };
        await writeFile(path.join(rootDirectory, 'dist', 'manifest.json'), JSON.stringify({ name: 'Prismwink', version: metadata.version, manifest_version: 3 }));
      }
    },
  };
  return { rootDirectory, outputDirectory, packagePath, lockPath, originalPackage, originalLock, calls, dependencies };
}
async function unchanged(files: Fixture): Promise<void> {
  assert.deepEqual(await readFile(files.packagePath), files.originalPackage);
  assert.deepEqual(await readFile(files.lockPath), files.originalLock);
  assert.equal((await readdir(files.rootDirectory)).includes('.publish-package.lock'), false);
}

test('failed validation restores package and lock bytes exactly and does not archive', async t => {
  const files = await fixture(t);
  let archived = false;
  files.dependencies.run = async () => { throw new Error('validation failed'); };
  files.dependencies.archive = async () => { archived = true; };
  await assert.rejects(publishPackage({ ...files, bump: 'patch' }), /validation failed/);
  await unchanged(files);
  assert.equal(archived, false);
  assert.deepEqual(await readdir(files.outputDirectory), []);
});

test('browser failure also rolls back the version after the build has succeeded', async t => {
  const files = await fixture(t);
  const successfulRun = files.dependencies.run!;
  files.dependencies.run = async (command, args, options) => {
    await successfulRun(command, args, options);
    if (args.includes('test:browser')) throw new Error('browser check failed');
  };
  await assert.rejects(publishPackage({ ...files, bump: 'minor' }), /browser check failed/);
  await unchanged(files);
  assert.deepEqual(files.calls, ['npm run check', 'npm run test:browser']);
});

test('cancellation before validation and during validation never leaves bumped version metadata', async t => {
  const files = await fixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(publishPackage({ ...files, bump: 'patch', signal: controller.signal }), PublishCancelledError);
  await unchanged(files);
  const later = new AbortController();
  files.dependencies.run = async () => { later.abort(); };
  await assert.rejects(publishPackage({ ...files, bump: 'patch', signal: later.signal }), PublishCancelledError);
  await unchanged(files);
  assert.deepEqual(await readdir(files.outputDirectory), []);
});

test('cancellation stops a validation descendant before restoring version files', { skip: process.platform === 'win32' }, async t => {
  const files = await fixture(t);
  const controller = new AbortController();
  const pidFile = path.join(files.rootDirectory, 'writer.pid');
  const heartbeat = path.join(files.rootDirectory, 'writer.log');
  const writer = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{fs.appendFileSync(process.argv[2],'x');fs.writeFileSync(process.argv[3],JSON.stringify({name:'prismwink',version:'999.0.0'}));},25);`;
  const parent = `const{spawn}=require('node:child_process');spawn(process.execPath,['-e',process.argv[1],process.argv[2],process.argv[3],process.argv[4]],{stdio:'ignore'});setInterval(()=>{},1000);`;
  files.dependencies.run = async (_command, _args, options) => runCommand(process.execPath, ['-e', parent, writer, pidFile, heartbeat, files.packagePath], options);
  const publishing = publishPackage({ ...files, bump: 'patch', signal: controller.signal });
  const deadline = Date.now() + 5000;
  while (true) {
    try { if ((await readFile(heartbeat)).length >= 2) break; } catch { /* Wait for the fixture subprocess to start. */ }
    if (Date.now() > deadline) { controller.abort(); await publishing.catch(() => {}); assert.fail('Validation descendant did not start.'); }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  controller.abort();
  await assert.rejects(publishing, PublishCancelledError);
  const before = await readFile(heartbeat);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(await readFile(heartbeat), before);
  await unchanged(files);
});

test('an existing archive is protected before version changes or validations run', async t => {
  const files = await fixture(t);
  const archivePath = path.join(files.outputDirectory, 'Prismwink-v0.1.1.zip');
  await writeFile(archivePath, 'existing archive');
  await assert.rejects(publishPackage({ ...files, bump: 'patch' }), /already exists/);
  await unchanged(files);
  assert.equal(await readFile(archivePath, 'utf8'), 'existing archive');
  assert.deepEqual(files.calls, []);
});

test('a collision occurring after validation is still protected by exclusive archive publication', async t => {
  const files = await fixture(t);
  const archivePath = path.join(files.outputDirectory, 'Prismwink-v0.1.1.zip');
  files.dependencies.archive = async (_dist, temporary) => {
    await writeFile(temporary, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]));
    await writeFile(archivePath, 'concurrent archive');
  };
  await assert.rejects(publishPackage({ ...files, bump: 'patch' }), /already exists/);
  await unchanged(files);
  assert.equal(await readFile(archivePath, 'utf8'), 'concurrent archive');
  assert.deepEqual(await readdir(files.outputDirectory), ['Prismwink-v0.1.1.zip']);
});

test('archive failure removes its partial ZIP and restores the exact old versions', async t => {
  const files = await fixture(t);
  files.dependencies.archive = async (_dist, temporary) => {
    await writeFile(temporary, 'partial zip');
    throw new Error('zip command failed');
  };
  await assert.rejects(publishPackage({ ...files, bump: 'major' }), /zip command failed/);
  await unchanged(files);
  assert.deepEqual(await readdir(files.outputDirectory), []);
});

test('a stale built manifest cannot be published under a newer version', async t => {
  const files = await fixture(t);
  files.dependencies.run = async () => {};
  await assert.rejects(publishPackage({ ...files, bump: 'patch' }), /built extension does not match/);
  await unchanged(files);
});

test('a changed version between prompt and publish is rejected before mutations', async t => {
  const files = await fixture(t);
  await assert.rejects(publishPackage({ ...files, bump: 'patch', expectedVersion: '0.0.9' }), /changed while you were choosing/);
  await unchanged(files);
});

test('success runs both checks, updates all version metadata, and creates an installable ZIP in the output directory', async t => {
  const files = await fixture(t);
  const result = await publishPackage({ ...files, bump: 'minor' });
  assert.equal(result.version, '0.2.0');
  assert.equal(result.previousVersion, '0.1.0');
  assert.equal(result.archivePath, path.join(files.outputDirectory, 'Prismwink-v0.2.0.zip'));
  assert.deepEqual(files.calls, ['npm run check', 'npm run test:browser']);
  const metadata = JSON.parse(await readFile(files.packagePath, 'utf8')) as { version: string };
  const lock = JSON.parse(await readFile(files.lockPath, 'utf8')) as { version: string; packages: Record<string, { version: string }> };
  assert.equal(metadata.version, '0.2.0');
  assert.equal(lock.version, '0.2.0');
  assert.equal(lock.packages[''].version, '0.2.0');
  assert.equal(lock.packages['node_modules/example'].version, '9.8.7');
  const manifest = JSON.parse((await exec('unzip', ['-p', result.archivePath, 'manifest.json'])).stdout) as { version: string };
  assert.equal(manifest.version, '0.2.0');
  assert.deepEqual(await readdir(files.outputDirectory), ['Prismwink-v0.2.0.zip']);
  assert.equal((await readdir(files.rootDirectory)).includes('.publish-package.lock'), false);
});
