export {};
const studioUrl = () => chrome.runtime.getURL('studio.html');
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.tabs.create({ url: studioUrl() });
});
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-vanish') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://meet.google.com/')) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'prismwink-toggle' }); }
  catch { /* A Meet tab needs to be reloaded after installation. */ }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === 'open-studio') {
    chrome.tabs.create({ url: studioUrl() }).then(() => respond({ ok: true }));
    return true;
  }
  return false;
});
