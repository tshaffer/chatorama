// lib/api.ts
import { API_BASE } from './apiBase'; // use the unified API_BASE if you’ve added apiBase.ts

/**
 * Generic JSON fetch helper for GET/POST/etc.
 * Automatically prefixes API_BASE if a relative path is provided.
 * Throws on non-OK responses with detailed message.
 */
export async function fetchJSON<T>(
  pathOrUrl: string,
  init?: RequestInit
): Promise<T> {
  // prefix relative paths with API_BASE
  const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
  const url = isAbsolute ? pathOrUrl : `${API_BASE}${pathOrUrl}`;

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // keep cookies for same-origin or auth sessions
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }

  return res.json() as Promise<T>;
}
