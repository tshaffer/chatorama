// exporterBridge.ts — runs on the Claude Code Exporter page (localhost:9090) and
// passes its Send to Chatalog requests to the background worker, so they reuse
// an open Chatalog tab exactly like Chatworthy's own Send to Chatalog.
//
// Protocol (window.postMessage, same window only):
//   page → bridge  { type: 'chatworthy:sendToChatalog', requestId, fileName, markdown }
//   bridge → page  { type: 'chatworthy:sendToChatalogResult', requestId, ok, error? }
// The page knows the bridge is there from <html data-chatworthy-bridge>.

document.documentElement.dataset.chatworthyBridge = '1';

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const msg = event.data;
  if (msg?.type !== 'chatworthy:sendToChatalog') return;
  if (typeof msg.markdown !== 'string' || typeof msg.fileName !== 'string') return;

  const reply = (ok: boolean, error?: string) =>
    window.postMessage(
      { type: 'chatworthy:sendToChatalogResult', requestId: msg.requestId, ok, error },
      location.origin,
    );

  try {
    chrome.runtime
      .sendMessage({ type: 'chatworthy:sendToChatalog', fileName: msg.fileName, markdown: msg.markdown })
      .then(
        (res) => reply(!!res?.ok, res?.error),
        (err) => reply(false, err?.message ?? 'extension unavailable'),
      );
  } catch (err: any) {
    // The extension was reloaded since this page loaded ("Extension context invalidated").
    reply(false, err?.message ?? 'extension unavailable');
  }
});
