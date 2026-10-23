chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-vanish') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://meet.google.com/')) return;
  // A Meet tab opened before installation has no content script until it reloads.
  await chrome.tabs.sendMessage(tab.id, { type: 'prismwink-toggle' }).catch(() => {});
});
