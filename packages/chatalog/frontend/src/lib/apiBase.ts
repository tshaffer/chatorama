// src/lib/apiBase.ts
/**
 * Single source of truth for the API base URL.
 *
 * Resolution order:
 *  1) Runtime override (global): (window as any).__CHATALOG_API_BASE__
 *  2) Runtime override (meta):   <meta name="chatalog-api-base" content="...">
 *  3) Build-time (Webpack):      process.env.CHATALOG_API_BASE
 *  4) Build-time (Vite):         import.meta.env.VITE_API_BASE
 *  5) Default:                   '/api/v1'
 *
 * Always normalized to NO trailing slash.
 */

function stripTrailingSlash(s: string) {
  return s.replace(/\/+$/, '');
}

function clean(v: unknown): string {
  // Guard against undefined/null and literal strings like "undefined"
  if (v == null) return '';
  const s = String(v).trim();
  return s && s !== 'undefined' && s !== 'null' ? s : '';
}

function readMeta(name: string): string {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  return el?.content ? el.content.trim() : '';
}

const runtimeGlobal = typeof window !== 'undefined'
  ? clean((window as any).__CHATALOG_API_BASE__)
  : '';

const runtimeMeta = readMeta('chatalog-api-base');

const buildWebpack = typeof process !== 'undefined' && (process as any).env
  ? clean((process as any).env.CHATALOG_API_BASE)
  : '';

const buildVite = typeof import.meta !== 'undefined' && (import.meta as any).env
  ? clean((import.meta as any).env.VITE_API_BASE)
  : '';

// Pick the first non-empty; fall back to '/api/v1'
const resolvedRaw =
  runtimeGlobal ||
  runtimeMeta ||
  buildWebpack ||
  buildVite ||
  '/api/v1';

export const API_BASE = stripTrailingSlash(resolvedRaw);

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
