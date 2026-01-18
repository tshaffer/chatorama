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
