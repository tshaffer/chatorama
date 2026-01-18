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
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
});
