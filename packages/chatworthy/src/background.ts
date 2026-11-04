import { API_BASE, CHATALOG_URL } from './config';

console.log('[Chatworthy] background worker active');

type DownloadMessage = {
  type: 'chatworthy:downloadJson';
  filename: string;
  data: unknown;
};

chrome.runtime.onMessage.addListener((message: DownloadMessage) => {
  if (!message || message.type !== 'chatworthy:downloadJson') return;
  const filename = message.filename || 'chatworthy-export.json';
  const json = JSON.stringify(message.data ?? {}, null, 2);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const url = `data:application/json;base64,${encoded}`;

  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    // data: URLs don't need explicit revocation in MV3 service workers.
  });
});

type SendToChatalogMessage = {
  type: 'chatworthy:sendToChatalog';
  fileName: string;
  markdown: string;
};

// Show the export for review in the Chatalog tab already open, if there is one.
// Changing only the #hash doesn't reload that tab, so nothing open in it is lost.
async function showInChatalog(importId: string) {
  const tabs = await chrome.tabs.query({ url: `${CHATALOG_URL}/*` });
  const tab = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  const url = new URL(tab?.url ?? CHATALOG_URL);
  url.hash = `import=${importId}`;
  if (tab?.id === undefined) {
    await chrome.tabs.create({ url: url.href });
    return;
  }
  await chrome.tabs.update(tab.id, { url: url.href, active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

async function sendToChatalog({ fileName, markdown }: SendToChatalogMessage) {
  const res = await fetch(`${API_BASE}/imports/pending?fileName=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/markdown' },
    body: markdown,
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const { id } = await res.json();
  await showInChatalog(id);
}

chrome.runtime.onMessage.addListener((message: SendToChatalogMessage, _sender, sendResponse) => {
  if (message?.type !== 'chatworthy:sendToChatalog') return;
  sendToChatalog(message).then(
    () => sendResponse({ ok: true }),
    (err) => sendResponse({ ok: false, error: err?.message ?? 'request failed' }),
  );
  return true; // sendResponse is called later
});
