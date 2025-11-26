export function slugifyStandard(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function slugifyAscentStripping(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')     // strip accents
    .replace(/[^a-z0-9]+/g, '-')         // non-alnum -> dashes
    .replace(/(^-|-$)/g, '')             // trim dashes
    .slice(0, 80) || 'note';
}

