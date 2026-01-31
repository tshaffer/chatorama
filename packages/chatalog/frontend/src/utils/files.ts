export function sanitizeFilenameTitle(title: string): string {
  if (!title) return '';

  let name = title.trim();
  if (!name) return '';

  name = name.replace(/\s+/g, ' ');
  name = name.replace(/[\/\\:*?"<>|\x00-\x1F\x7F]/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
