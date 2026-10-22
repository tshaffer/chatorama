// packages/chatworthy/src/recipeBulkContent.ts
// NYT Cooking Recipe Box bulk importer — visible UI + console API.

import { extractRecipeJsonLdFromDocument } from './recipeExtractor';
import { API_BASE } from './config';

const STORAGE_KEY = 'chatworthy:nytRecipeBoxImport';
const RESULTS_FILE = 'nyt-import-results.json';
const URLS_FILE = 'nyt-recipe-urls.json';

const DEFAULTS = {
  concurrency: 2,
  delayMsMin: 300,
  delayMsMax: 700,
  maxPages: 40,
};

// UI element IDs
const BULK_ROOT_ID = 'chatworthy-bulk-root';
const BULK_STATUS_ID = 'chatworthy-bulk-status';
const BULK_COUNTERS_ID = 'chatworthy-bulk-counters';
const BULK_BTN_IMPORT_ID = 'chatworthy-bulk-btn-import';
const BULK_BTN_RETRY_ID = 'chatworthy-bulk-btn-retry';
const BULK_BTN_CANCEL_ID = 'chatworthy-bulk-btn-cancel';

// Set to true to stop an in-progress import
let abortImport = false;

type FailedEntry = { url: string; error: string };

type ProgressState = {
  discoveredUrls: string[];
  completedUrls: string[];
  skippedUrls: string[];
  failedUrls: FailedEntry[];
  updatedAt: string;
};

type BulkOptions = {
  concurrency?: number;
  delayMsMin?: number;
  delayMsMax?: number;
  dryRun?: boolean;
  retryFailed?: boolean;
  maxPages?: number;
  maxScrolls?: number;
  onProgress?: (counts: { discovered: number; imported: number; skipped: number; failed: number }) => void;
};

type UiState = {
  status: string;
  isError?: boolean;
  running: boolean;
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
};

function isTopWindow() {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function jitter(min: number, max: number) {
  return Math.floor(min + Math.random() * Math.max(1, max - min));
}

function normalizeRecipeUrl(href: string): string | null {
  try {
    const u = new URL(href, location.origin);
    if (u.origin !== 'https://cooking.nytimes.com') return null;
    if (!u.pathname.startsWith('/recipes/')) return null;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

async function getStoredProgress(): Promise<ProgressState> {
  const base: ProgressState = {
    discoveredUrls: [],
    completedUrls: [],
    skippedUrls: [],
    failedUrls: [],
    updatedAt: new Date().toISOString(),
  };

  if (!chrome?.storage?.local) return base;

  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stored = data?.[STORAGE_KEY] as Partial<ProgressState> | undefined;
  if (!stored) return base;

  return {
    discoveredUrls: Array.isArray(stored.discoveredUrls) ? stored.discoveredUrls : [],
    completedUrls: Array.isArray(stored.completedUrls) ? stored.completedUrls : [],
    skippedUrls: Array.isArray(stored.skippedUrls) ? stored.skippedUrls : [],
    failedUrls: Array.isArray(stored.failedUrls) ? stored.failedUrls : [],
    updatedAt: new Date().toISOString(),
  };
}

async function saveProgress(progress: ProgressState): Promise<void> {
  if (!chrome?.storage?.local) return;
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      ...progress,
      updatedAt: new Date().toISOString(),
    },
  });
}

function sendDownload(filename: string, data: unknown) {
  if (!chrome?.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({
    type: 'chatworthy:downloadJson',
    filename,
    data,
  });
}

type DiscoveryResult = {
  urls: string[];
  pagesVisited: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  stoppedReason: string;
};

type ResultsCounts = {
  start: number;
  end: number;
  total: number;
  pageSize: number;
  totalPages: number;
  text: string;
};

function parseResultsCountText(text: string): ResultsCounts | null {
  const match = text.match(/([\d,]+)\s*[–-]\s*([\d,]+)\s*of\s*([\d,]+)/i);
  if (!match) return null;
  const start = Number(match[1].replace(/,/g, ''));
  const end = Number(match[2].replace(/,/g, ''));
  const total = Number(match[3].replace(/,/g, ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(total)) return null;
  if (start <= 0 || end < start || total < end) return null;
  const pageSize = end - start + 1;
  const totalPages = Math.ceil(total / pageSize);
  return { start, end, total, pageSize, totalPages, text };
}

function findResultsCounts(): ResultsCounts | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .map((el) => el.textContent?.trim())
    .filter((t): t is string => Boolean(t));
  const matches = candidates
    .filter((text) => /[\d,]+\s*[–-]\s*[\d,]+\s*of\s*[\d,]+/i.test(text))
    .sort((a, b) => a.length - b.length);
  const preferred = matches.find((text) => text.length <= 120) ?? matches[0];
  if (preferred) {
    const parsed = parseResultsCountText(preferred);
    if (parsed) return parsed;
  }
  for (const text of candidates) {
    const parsed = parseResultsCountText(text);
    if (parsed) return parsed;
  }
  return null;
}

function getRecipeLinksOnPage(): string[] {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const urls: string[] = [];
  for (const a of links) {
    const url = normalizeRecipeUrl(a.href);
    if (url) urls.push(url);
  }
  return urls;
}

function getActivePageNumber(): string | null {
  const current = document.querySelector<HTMLElement>('[aria-current="page"]');
  if (current?.textContent) return current.textContent.trim();
  return null;
}


async function discoverRecipeUrls(_maxPages: number): Promise<DiscoveryResult> {
  const urls = new Set<string>();
  let pagesVisited = 0;
  let stoppedReason = '';
  let pageSize = 0;
  let totalResults = 0;
  let totalPages = 0;

  const counts = findResultsCounts();
  if (!counts) {
    return {
      urls: [],
      pagesVisited: 0,
      pageSize: 0,
      totalResults: 0,
      totalPages: 0,
      stoppedReason: 'results-text-missing',
    };
  }

  pageSize = counts.pageSize;
  totalResults = counts.total;
  totalPages = counts.totalPages;

  console.log('[chatworthy][recipe] results counts', {
    text: counts.text,
    start: counts.start,
    end: counts.end,
    total: counts.total,
    pageSize: counts.pageSize,
    totalPages: counts.totalPages,
  });

  const links = getRecipeLinksOnPage();
  const uniqueLinks = new Set(links);
  for (const url of uniqueLinks) urls.add(url);
  pagesVisited = links.length ? 1 : 0;

  console.log('[chatworthy][recipe] page', {
    pageIndex: Number(getActivePageNumber() ?? 1),
    recipesFound: uniqueLinks.size,
    cumulativeTotal: urls.size,
  });

  stoppedReason = 'manual';

  console.log('[chatworthy][recipe] stop', { stoppedReason, pagesVisited, total: urls.size });

  return {
    urls: Array.from(urls),
    pagesVisited,
    pageSize,
    totalResults,
    totalPages,
    stoppedReason,
  };
}

async function fetchRecipeJsonLd(pageUrl: string): Promise<unknown> {
  const res = await fetch(pageUrl, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`NYT fetch failed: ${res.status}`);
  }
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const recipe = extractRecipeJsonLdFromDocument(doc);
  if (!recipe) throw new Error('Recipe JSON-LD not found');
  return recipe;
}

async function postToBackend(pageUrl: string, recipeJsonLd: unknown): Promise<Response> {
  return fetch(`${API_BASE}/recipes/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ pageUrl, recipeJsonLd }),
  });
}

async function runBulkImport(options: BulkOptions = {}) {
  if (!isTopWindow()) return;

  const concurrency = options.concurrency ?? DEFAULTS.concurrency;
  const delayMsMin = options.delayMsMin ?? DEFAULTS.delayMsMin;
  const delayMsMax = options.delayMsMax ?? DEFAULTS.delayMsMax;
  const maxPages = options.maxPages ?? options.maxScrolls ?? DEFAULTS.maxPages;
  const dryRun = Boolean(options.dryRun);
  const retryFailed = Boolean(options.retryFailed);
  const onProgress = options.onProgress;

  const discovery = await discoverRecipeUrls(maxPages);
  const discovered = discovery.urls;
  const progress = await getStoredProgress();

  progress.discoveredUrls = discovered;
  sendDownload(URLS_FILE, discovered);

  if (dryRun) {
    await saveProgress(progress);
    return {
      totalDiscovered: discovered.length,
      pagesVisited: discovery.pagesVisited,
      pageSize: discovery.pageSize,
      totalResults: discovery.totalResults,
      totalPages: discovery.totalPages,
    };
  }

  const completed = new Set(progress.completedUrls);
  const skipped = new Set(progress.skippedUrls);
  const failed = new Map(progress.failedUrls.map((f) => [f.url, f.error]));

  const pending = discovered.filter((url) => {
    if (completed.has(url)) return false;
    if (skipped.has(url)) return false;
    if (failed.has(url) && !retryFailed) return false;
    return true;
  });

  const queue = [...pending];
  const imported: string[] = [];
  const skippedNow: string[] = [];
  const failedNow: FailedEntry[] = [];

  async function worker() {
    while (queue.length) {
      if (abortImport) break;
      const url = queue.shift();
      if (!url) break;

      try {
        const recipeJsonLd = await fetchRecipeJsonLd(url);
        const res = await postToBackend(url, recipeJsonLd);
        if (res.ok) {
          imported.push(url);
          completed.add(url);
        } else if (res.status === 409) {
          skippedNow.push(url);
          skipped.add(url);
        } else {
          const msg = `Import failed: ${res.status}`;
          failedNow.push({ url, error: msg });
          failed.set(url, msg);
        }
      } catch (err: any) {
        const msg = err?.message ? String(err.message) : 'Unknown error';
        failedNow.push({ url, error: msg });
        failed.set(url, msg);
      }

      await saveProgress({
        ...progress,
        completedUrls: Array.from(completed),
        skippedUrls: Array.from(skipped),
        failedUrls: Array.from(failed.entries()).map(([u, error]) => ({ url: u, error })),
      });

      onProgress?.({
        discovered: discovered.length,
        imported: imported.length,
        skipped: skippedNow.length,
        failed: failedNow.length,
      });

      if (!abortImport) {
        await sleep(jitter(delayMsMin, delayMsMax));
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);

  const finalProgress: ProgressState = {
    discoveredUrls: progress.discoveredUrls,
    completedUrls: Array.from(completed),
    skippedUrls: Array.from(skipped),
    failedUrls: Array.from(failed.entries()).map(([url, error]) => ({ url, error })),
    updatedAt: new Date().toISOString(),
  };

  await saveProgress(finalProgress);
  sendDownload(RESULTS_FILE, {
    totalDiscovered: discovered.length,
    imported: imported.length,
    skipped: skippedNow.length,
    failed: failedNow.length,
    results: finalProgress,
  });

  return {
    totalDiscovered: discovered.length,
    imported: imported.length,
    skipped: skippedNow.length,
    failed: failedNow.length,
  };
}

// ─── Overlay UI ──────────────────────────────────────────────────────────────

function updateUi(state: UiState) {
  const statusEl = document.getElementById(BULK_STATUS_ID);
  if (statusEl) {
    statusEl.textContent = state.status;
    statusEl.style.color = state.isError ? '#b91c1c' : '#444';
  }

  const countersEl = document.getElementById(BULK_COUNTERS_ID);
  if (countersEl) {
    if (state.discovered > 0) {
      countersEl.textContent =
        `Found: ${state.discovered} | Done: ${state.imported} | Skip: ${state.skipped} | Fail: ${state.failed}`;
      countersEl.style.display = '';
    } else {
      countersEl.style.display = 'none';
    }
  }

  const importBtn = document.getElementById(BULK_BTN_IMPORT_ID) as HTMLButtonElement | null;
  if (importBtn) importBtn.disabled = state.running;

  const retryBtn = document.getElementById(BULK_BTN_RETRY_ID) as HTMLButtonElement | null;
  if (retryBtn) {
    retryBtn.disabled = state.running;
    retryBtn.style.display = state.failed > 0 && !state.running ? '' : 'none';
  }

  const cancelBtn = document.getElementById(BULK_BTN_CANCEL_ID) as HTMLButtonElement | null;
  if (cancelBtn) {
    cancelBtn.style.display = state.running ? '' : 'none';
  }
}

function ensureBulkUi() {
  if (document.getElementById(BULK_ROOT_ID)) return;

  const root = document.createElement('div');
  root.id = BULK_ROOT_ID;
  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '2147483647',
    right: '16px',
    top: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.15)',
    background: 'rgba(255,255,255,0.97)',
    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
    fontSize: '12px',
    minWidth: '210px',
    maxWidth: '260px',
    fontFamily: 'system-ui,-apple-system,sans-serif',
  });

  const titleEl = document.createElement('div');
  titleEl.textContent = 'Chatworthy';
  Object.assign(titleEl.style, { fontWeight: '700', fontSize: '13px', color: '#111' });

  const statusEl = document.createElement('div');
  statusEl.id = BULK_STATUS_ID;
  statusEl.textContent = 'Ready to import';
  Object.assign(statusEl.style, { color: '#444', fontSize: '11px' });

  const countersEl = document.createElement('div');
  countersEl.id = BULK_COUNTERS_ID;
  countersEl.style.display = 'none';
  Object.assign(countersEl.style, { color: '#666', fontSize: '11px' });

  const btnRow = document.createElement('div');
  Object.assign(btnRow.style, { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' });

  function makeBtn(id: string, label: string, primary: boolean) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      fontSize: '11px',
      padding: '5px 9px',
      borderRadius: '6px',
      border: '1px solid rgba(0,0,0,0.2)',
      background: primary ? '#1a1a1a' : 'white',
      color: primary ? 'white' : '#111',
      cursor: 'pointer',
      fontWeight: '600',
    });
    btn.onmouseenter = () => { btn.style.opacity = '0.85'; };
    btn.onmouseleave = () => { btn.style.opacity = '1'; };
    return btn;
  }

  const importBtn = makeBtn(BULK_BTN_IMPORT_ID, 'Import All', true);
  const retryBtn = makeBtn(BULK_BTN_RETRY_ID, 'Retry Failed', false);
  const cancelBtn = makeBtn(BULK_BTN_CANCEL_ID, 'Cancel', false);

  retryBtn.style.display = 'none';
  cancelBtn.style.display = 'none';

  async function startImport(retryFailed: boolean) {
    abortImport = false;
    let discovered = 0;
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    updateUi({ status: 'Discovering recipes on this page…', running: true, discovered, imported, skipped, failed });

    try {
      const result = await runBulkImport({
        retryFailed,
        onProgress: (counts) => {
          discovered = counts.discovered;
          imported = counts.imported;
          skipped = counts.skipped;
          failed = counts.failed;
          const done = imported + skipped + failed;
          updateUi({
            status: `Importing… (${done} / ${discovered})`,
            running: true,
            discovered,
            imported,
            skipped,
            failed,
          });
        },
      });

      const finalDiscovered = result?.totalDiscovered ?? discovered;
      const finalImported = result?.imported ?? imported;
      const finalSkipped = result?.skipped ?? skipped;
      const finalFailed = result?.failed ?? failed;

      updateUi({
        status: abortImport ? 'Cancelled' : 'Done ✅',
        running: false,
        discovered: finalDiscovered,
        imported: finalImported,
        skipped: finalSkipped,
        failed: finalFailed,
      });
    } catch (err: any) {
      updateUi({
        status: err?.message ?? 'Import error',
        isError: true,
        running: false,
        discovered,
        imported,
        skipped,
        failed,
      });
    }
  }

  importBtn.onclick = () => void startImport(false);
  retryBtn.onclick = () => void startImport(true);
  cancelBtn.onclick = () => { abortImport = true; };

  btnRow.appendChild(importBtn);
  btnRow.appendChild(retryBtn);
  btnRow.appendChild(cancelBtn);

  root.appendChild(titleEl);
  root.appendChild(statusEl);
  root.appendChild(countersEl);
  root.appendChild(btnRow);

  (document.body || document.documentElement).appendChild(root);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  if (!isTopWindow()) return;

  const host = (location.host || '').toLowerCase();
  if (host !== 'cooking.nytimes.com') return;

  // Keep console API for backward compatibility
  (window as any).__chatworthyBulkImportRecipes = runBulkImport;

  // Show visible UI on recipe-box page
  const path = location.pathname || '';
  if (path === '/recipe-box' || path.startsWith('/recipe-box/')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureBulkUi, { once: true });
    } else {
      ensureBulkUi();
    }
  }

  console.log('[chatworthy][recipe] bulk importer ready.');
}

init();
