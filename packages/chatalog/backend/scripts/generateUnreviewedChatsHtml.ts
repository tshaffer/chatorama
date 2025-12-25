import fs from 'fs/promises';
import path from 'path';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose';
import { ChatRegistryModel } from '../src/models/ChatRegistry';

async function main() {
  await connectToDatabase();

  try {
    const rows = await ChatRegistryModel.find({ status: 'UNREVIEWED' })
      .sort({ lastExportedAt: -1, updatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    const generatedAt = new Date().toISOString();
    const outDir = path.resolve(__dirname, '../out');
    const outPath = path.join(outDir, 'unreviewed-chats.html');

    await fs.mkdir(outDir, { recursive: true });

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Unreviewed Chats</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h2>Unreviewed Chats (${rows.length})</h2>
  <div style="color:#555; font-size:12px;">generatedAt: ${generatedAt}</div>
  <table>
    <thead>
      <tr>
        <th>Subject</th>
        <th>Topic</th>
        <th>Chat Title</th>
        <th>Last Exported</th>
        <th>Link</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((r) => {
          const link = r.pageUrl || `https://chatgpt.com/c/${r.chatId}`;
          const last = r.lastExportedAt ? new Date(r.lastExportedAt).toISOString() : '—';
          const esc = (s: any) =>
            typeof s === 'string'
              ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              : '';
          return `<tr>
            <td>${esc(r.subject) || '—'}</td>
            <td>${esc(r.topic) || '—'}</td>
            <td>${esc(r.chatTitle) || '—'}</td>
            <td>${last}</td>
            <td><a href="${link}" target="_blank" rel="noopener noreferrer">${esc(link)}</a></td>
          </tr>`;
        })
        .join('\n')}
    </tbody>
  </table>
</body>
</html>`;

    await fs.writeFile(outPath, html, 'utf8');

    console.log(`Generated ${rows.length} unreviewed chats -> ${outPath}`);
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
