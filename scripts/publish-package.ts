import { spawn, type ChildProcess } from 'node:child_process';
import { link, lstat, mkdir, mkdtemp, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

export type VersionBump = 'patch' | 'minor' | 'major';
interface VersionDocument { version: string; [key: string]: unknown }
interface LockDocument extends VersionDocument { packages: Record<string, { version?: string; [key: string]: unknown }> }
interface CommandOptions { cwd: string; signal?: AbortSignal }
export interface PublishDependencies {
  run: (command: string, args: readonly string[], options: CommandOptions) => Promise<void>;
  archive: (distDirectory: string, temporaryArchive: string, signal?: AbortSignal) => Promise<void>;
  log: (message: string) => void;
}
export interface PublishOptions {
  rootDirectory: string;
  outputDirectory?: string;
  bump: VersionBump;
  expectedVersion?: string;
  signal?: AbortSignal;
  dependencies?: Partial<PublishDependencies>;
}
export interface PublishResult { version: string; previousVersion: string; archivePath: string }

export class PublishCancelledError extends Error {
  constructor() { super('Package publishing canceled. Version files were left unchanged or restored.'); this.name = 'PublishCancelledError'; }
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PublishCancelledError();
}

function versionParts(version: string): [number, number, number] {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Invalid extension version ${JSON.stringify(version)}. Use three integers such as 0.1.0, without a prerelease suffix.`);
  }
  const parts = version.split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part) || part > 65535)) throw new Error('Each extension version component must be between 0 and 65535.');
  return parts as [number, number, number];
}

export function nextVersion(current: string, bump: VersionBump): string {
  const [major, minor, patch] = versionParts(current);
  let next: [number, number, number];
  if (bump === 'patch') next = [major, minor, patch + 1];
  else if (bump === 'minor') next = [major, minor + 1, 0];
  else if (bump === 'major') next = [major + 1, 0, 0];
  else throw new Error('Choose patch, minor or major.');
  const result = next.join('.');
  versionParts(result);
  return result;
}

async function stopCommandGroup(child: ChildProcess): Promise<void> {
  if (process.platform === 'win32' || !child.pid) { child.kill('SIGTERM'); return; }
  const group = -child.pid;
  const exists = () => {
    try { process.kill(group, 0); return true; }
    catch (error) { if (isFsError(error, 'ESRCH')) return false; throw error; }
  };
  try { process.kill(group, 'SIGTERM'); }
  catch (error) { if (isFsError(error, 'ESRCH')) return; throw error; }
  const deadline = Date.now() + 1000;
  while (exists() && Date.now() < deadline) await wait(25);
  if (exists()) {
    try { process.kill(group, 'SIGKILL'); }
    catch (error) { if (!isFsError(error, 'ESRCH')) throw error; }
    // SIGKILL stops descendants before version rollback, even if their parents have exited.
    await wait(100);
  }
}

export async function runCommand(command: string, args: readonly string[], options: CommandOptions): Promise<void> {
  checkCancellation(options.signal);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, stdio: 'inherit', detached: process.platform !== 'win32' });
    let settled = false;
    let stopping: Promise<void> | undefined;
    const cleanup = () => options.signal?.removeEventListener('abort', abort);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      if (stopping) return;
      stopping = stopCommandGroup(child);
      void stopping.catch(() => {});
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.once('error', error => finish(error));
    child.once('close', (code, signal) => {
      if (options.signal?.aborted) {
        void (async () => {
          try { await stopping; finish(new PublishCancelledError()); }
          catch (error) { finish(error instanceof Error ? error : new Error('Could not stop validation subprocesses.')); }
        })();
      } else if (code !== 0) finish(new Error(`${command} ${args.join(' ')} failed (${signal || `exit ${code ?? 'unknown'}`}).`));
      else finish();
    });
  });
}

async function createZip(distDirectory: string, temporaryArchive: string, signal?: AbortSignal): Promise<void> {
  await runCommand('zip', ['-qr', temporaryArchive, '.', '-x', '*.map'], { cwd: distDirectory, signal });
}

function isFsError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function requireMissing(file: string): Promise<void> {
  try { await lstat(file); }
  catch (error) { if (isFsError(error, 'ENOENT')) return; throw error; }
  throw new Error(`Archive already exists: ${file}. Nothing was overwritten.`);
}

function readPackage(buffer: Buffer, file: string): VersionDocument {
  let value: unknown;
  try { value = JSON.parse(buffer.toString('utf8')); }
  catch { throw new Error(`${file} is not valid JSON.`); }
  if (!value || typeof value !== 'object' || !('version' in value) || typeof value.version !== 'string') throw new Error(`${file} must contain a version string.`);
  versionParts(value.version);
  return value as VersionDocument;
}

function readLock(buffer: Buffer, expected: string): LockDocument {
  const lock = readPackage(buffer, 'package-lock.json');
  const packages = lock.packages;
  if (!packages || typeof packages !== 'object' || !('' in packages)) throw new Error('package-lock.json must contain its root package metadata. Run npm install first.');
  const root = (packages as Record<string, unknown>)[''];
  if (!root || typeof root !== 'object' || !('version' in root) || root.version !== expected || lock.version !== expected) throw new Error('package.json and package-lock.json versions do not match. Run npm install before publishing.');
  return lock as LockDocument;
}

export async function publishPackage(options: PublishOptions): Promise<PublishResult> {
  const root = path.resolve(options.rootDirectory);
  const output = path.resolve(options.outputDirectory || path.join(homedir(), 'Desktop'));
  const dependencies: PublishDependencies = { run: runCommand, archive: createZip, log: message => console.log(message), ...options.dependencies };
  const packagePath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const guardPath = path.join(root, '.publish-package.lock');
  let guard: FileHandle | undefined;
  let temporaryDirectory: string | undefined;
  let originalPackage: Buffer | undefined;
  let originalLock: Buffer | undefined;
  let changed = false;
  let committed = false;
  try {
    checkCancellation(options.signal);
    try { guard = await open(guardPath, 'wx'); }
    catch (error) {
      if (isFsError(error, 'EEXIST')) throw new Error('Another package publishing attempt holds .publish-package.lock. Wait for it to finish.');
      throw error;
    }
    originalPackage = await readFile(packagePath);
    originalLock = await readFile(lockPath);
    const packageDocument = readPackage(originalPackage, 'package.json');
    const previousVersion = packageDocument.version;
    if (options.expectedVersion !== undefined && previousVersion !== options.expectedVersion) throw new Error('The package version changed while you were choosing a release. Run publish:package again.');
    const lockDocument = readLock(originalLock, previousVersion);
    const version = nextVersion(previousVersion, options.bump);
    const archivePath = path.join(output, `Prismwink-v${version}.zip`);
    await mkdir(output, { recursive: true });
    await requireMissing(archivePath);
    checkCancellation(options.signal);
    packageDocument.version = version;
    lockDocument.version = version;
    lockDocument.packages[''].version = version;
    changed = true;
    await writeFile(packagePath, `${JSON.stringify(packageDocument, null, 2)}\n`);
    await writeFile(lockPath, `${JSON.stringify(lockDocument, null, 2)}\n`);
    dependencies.log(`Validating Prismwink ${version}…`);
    await dependencies.run('npm', ['run', 'check'], { cwd: root, signal: options.signal });
    checkCancellation(options.signal);
    await dependencies.run('npm', ['run', 'test:browser'], { cwd: root, signal: options.signal });
    checkCancellation(options.signal);
    const dist = path.join(root, 'dist');
    const manifest = readPackage(await readFile(path.join(dist, 'manifest.json')), 'dist/manifest.json');
    if (manifest.name !== 'Prismwink' || manifest.version !== version) throw new Error('The built extension does not match the selected Prismwink version. Rebuild it before packaging.');
    temporaryDirectory = await mkdtemp(path.join(output, '.prismwink-package-'));
    const temporaryArchive = path.join(temporaryDirectory, `Prismwink-v${version}.zip`);
    await dependencies.archive(dist, temporaryArchive, options.signal);
    checkCancellation(options.signal);
    const archiveInfo = await lstat(temporaryArchive);
    if (!archiveInfo.isFile() || archiveInfo.size < 4) throw new Error('The archive command did not create a valid ZIP file.');
    const archiveFile = await open(temporaryArchive, 'r');
    try {
      const signature = Buffer.alloc(4);
      await archiveFile.read(signature, 0, 4, 0);
      if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('The archive command did not create a ZIP package.');
    } finally { await archiveFile.close(); }
    checkCancellation(options.signal);
    try {
      await link(temporaryArchive, archivePath);
    } catch (error) {
      if (isFsError(error, 'EEXIST')) throw new Error(`Archive already exists: ${archivePath}. Nothing was overwritten.`);
      throw error;
    }
    committed = true;
    return { version, previousVersion, archivePath };
  } catch (error) {
    if (changed && !committed && originalPackage && originalLock) {
      const failures: unknown[] = [];
      for (const [file, bytes] of [[packagePath, originalPackage], [lockPath, originalLock]] as const) {
        try { await writeFile(file, bytes); } catch (rollbackError) { failures.push(rollbackError); }
      }
      if (failures.length) throw new AggregateError([error, ...failures], 'Publishing failed and a version file could not be restored. Inspect package.json and package-lock.json before continuing.');
      dependencies.log('Version files restored. Validation may have changed dist; run npm run build before using that local build.');
    }
    throw error;
  } finally {
    if (temporaryDirectory) {
      try { await rm(temporaryDirectory, { recursive: true, force: true }); }
      catch { dependencies.log(`Temporary archive cleanup is needed: ${temporaryDirectory}`); }
    }
    if (guard) {
      try { await guard.close(); await unlink(guardPath); }
      catch { dependencies.log('The publishing lock could not be removed. Check .publish-package.lock before another attempt.'); }
    }
  }
}

export async function promptVersionBump(current: string, options: { input?: NodeJS.ReadableStream & { isTTY?: boolean }; output?: NodeJS.WritableStream & { isTTY?: boolean }; signal?: AbortSignal } = {}): Promise<VersionBump | null> {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  if (!input.isTTY || !output.isTTY) throw new Error('publish:package requires an interactive terminal to choose patch, minor or major. Run it directly in your terminal.');
  checkCancellation(options.signal);
  const choices: VersionBump[] = ['patch', 'minor', 'major'];
  output.write(`\nCurrent version: ${current}\n`);
  const labels: Record<VersionBump, string> = { patch: 'fixes and small changes', minor: 'new compatible features', major: 'breaking changes' };
  choices.forEach((bump, index) => {
    try { output.write(`  ${index + 1}) ${bump.padEnd(5)} → ${nextVersion(current, bump)} · ${labels[bump]}\n`); }
    catch { output.write(`  ${index + 1}) ${bump.padEnd(5)} → unavailable (version limit)\n`); }
  });
  output.write('  q) cancel\n\n');
  const readline = createInterface({ input, output, terminal: true });
  const promptAbort = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, promptAbort.signal]) : promptAbort.signal;
  readline.once('SIGINT', () => promptAbort.abort());
  readline.once('close', () => promptAbort.abort());
  try {
    while (true) {
      let answer: string;
      try { answer = (await readline.question('Choose a version bump [1/2/3/q]: ', { signal })).trim().toLowerCase(); }
      catch (error) { if (signal.aborted) throw new PublishCancelledError(); throw error; }
      if (answer === 'q' || answer === 'cancel' || answer === 'quit') return null;
      const bump = answer === '1' ? 'patch' : answer === '2' ? 'minor' : answer === '3' ? 'major' : choices.find(choice => choice === answer);
      if (bump) {
        try { nextVersion(current, bump); return bump; }
        catch (error) { output.write(`${error instanceof Error ? error.message : 'That version is unavailable.'}\n`); }
      } else output.write('Enter 1, 2, 3, patch, minor, major, or q to cancel.\n');
    }
  } finally { readline.close(); }
}

export function parseOutputDirectory(args: readonly string[]): string | undefined {
  let output: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument !== '--output-dir' || output !== undefined || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Usage: npm run publish:package -- [--output-dir PATH]');
    output = args[++index];
  }
  return output;
}

async function main(): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const rootDirectory = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
    const outputDirectory = parseOutputDirectory(process.argv.slice(2));
    const document = readPackage(await readFile(path.join(rootDirectory, 'package.json')), 'package.json');
    const bump = await promptVersionBump(document.version, { signal: controller.signal });
    if (!bump) { console.log('Canceled. Version files were not changed.'); return; }
    const result = await publishPackage({ rootDirectory, outputDirectory, bump, expectedVersion: document.version, signal: controller.signal });
    console.log(`\nPrismwink ${result.version} is ready:\n${result.archivePath}\n\nThis command creates a local package. It does not upload or publish it to a store.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Package publishing failed.');
    process.exitCode = error instanceof PublishCancelledError ? 130 : 1;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) void main();
