// packages/chatworthy/src/recipeBulkContent.ts
// NYT Cooking Recipe Box bulk importer (dev command).

import { extractRecipeJsonLdFromDocument } from './recipeExtractor';

const API_BASE = 'http://localhost:8080/api/v1';
const STORAGE_KEY = 'chatworthy:nytRecipeBoxImport';
const RESULTS_FILE = 'nyt-import-results.json';
const URLS_FILE = 'nyt-recipe-urls.json';

const DEFAULTS = {
  concurrency: 2,
  delayMsMin: 300,
  delayMsMax: 700,
  maxPages: 40,
};

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
  const match = text.match(/([\d,]+)\s*[\u2013-]\s*([\d,]+)\s*of\s*([\d,]+)/i);
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
    .filter((text) => /[\d,]+\s*[\u2013-]\s*[\d,]+\s*of\s*[\d,]+/i.test(text))
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

      await sleep(jitter(delayMsMin, delayMsMax));
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

function init() {
  if (!isTopWindow()) return;
  const host = (location.host || '').toLowerCase();
  if (host !== 'cooking.nytimes.com') return;
  (window as any).__chatworthyBulkImportRecipes = runBulkImport;
  console.log('[chatworthy][recipe] bulk importer ready.');
}

init();
