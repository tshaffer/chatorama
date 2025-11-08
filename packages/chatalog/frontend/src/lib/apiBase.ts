// src/lib/apiBase.ts
/**
 * Single source of truth for the API base URL.
 *
 * Resolution order:
 *  1) Runtime override: (window as any).__CHATALOG_API_BASE__
 *  2) Build-time env: process.env.CHATALOG_API_BASE (Webpack DefinePlugin)
 *     or import.meta.env.VITE_API_BASE (Vite)
 *  3) Default: same-origin (empty string)
 *
 * Always normalized to have NO trailing slash.
 */

function stripTrailingSlash(s: string) {
  return s.replace(/\/+$/, '');
}

const runtime =
  typeof window !== 'undefined' && (window as any).__CHATALOG_API_BASE__;

const buildWebpack =
  typeof process !== 'undefined' &&
  (process as any).env &&
  (process as any).env.CHATALOG_API_BASE;

const buildVite =
  typeof import.meta !== 'undefined' &&
  (import.meta as any).env &&
  (import.meta as any).env.VITE_API_BASE;

const resolved =
  (runtime as string) ||
  (buildWebpack as string) ||
  (buildVite as string) ||
  '';

export const API_BASE = stripTrailingSlash(resolved);

/**
 * Join helper that safely builds URLs:
 *   apiUrl('imports/chatworthy') -> '/imports/chatworthy' (same-origin)
 *   apiUrl('/imports/chatworthy') -> '/imports/chatworthy'
 *   apiUrl('health') -> '/health' or 'https://api.example.com/health'
 */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}
