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
  totalResultsText: string;
  stoppedReason: string;
};

function findTotalResultsText(): string {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .map((el) => el.textContent?.trim())
    .filter((t) => t && /\d+\s*[\u2013-]\s*\d+\s*of\s*\d+/i.test(t));
  return candidates[0] ?? '';
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

function getPageNumberButtons(): HTMLElement[] {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('a,button'));
  return buttons.filter((el) => /^\d+$/.test((el.textContent ?? '').trim()));
}

function isDisabled(el: HTMLElement): boolean {
  const ariaDisabled = el.getAttribute('aria-disabled');
  if (ariaDisabled === 'true') return true;
  if ('disabled' in el && (el as any).disabled) return true;
  return el.classList.contains('disabled');
}

function findNextButton(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('a,button'));
  for (const el of candidates) {
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const text = (el.textContent || '').trim().toLowerCase();
    if (aria.includes('next') || text === '>' || text === '›' || text.includes('next')) {
      return el;
    }
  }
  return null;
}

async function waitForPageChange(args: {
  prevPage: string | null;
  prevFirstUrl: string | null;
  timeoutMs: number;
}) {
  const { prevPage, prevFirstUrl, timeoutMs } = args;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const active = getActivePageNumber();
    const links = getRecipeLinksOnPage();
    const first = links[0] ?? null;
    if (active && prevPage && active !== prevPage) return true;
    if (first && prevFirstUrl && first !== prevFirstUrl) return true;
    await sleep(200);
  }
  return false;
}

async function discoverRecipeUrls(maxPages: number): Promise<DiscoveryResult> {
  const urls = new Set<string>();
  const seenPageKeys = new Set<string>();
  let pagesVisited = 0;
  let stoppedReason = '';
  let pageSize = 0;
  let totalResultsText = '';

  for (let i = 0; i < maxPages; i += 1) {
    const pageNum = getActivePageNumber();
    const links = getRecipeLinksOnPage();
    const firstUrl = links[0] ?? null;
    const pageKey = pageNum || firstUrl || `page-${i + 1}`;

    if (seenPageKeys.has(pageKey)) {
      stoppedReason = 'page-repeat';
      break;
    }
    seenPageKeys.add(pageKey);

    if (!totalResultsText) totalResultsText = findTotalResultsText();

    pageSize = links.length;
    for (const url of links) urls.add(url);
    pagesVisited += 1;

    const pageButtons = getPageNumberButtons();
    const nextPageNum =
      pageNum && /^\d+$/.test(pageNum) ? String(Number(pageNum) + 1) : null;
    const nextPageBtn =
      nextPageNum != null
        ? pageButtons.find((el) => (el.textContent ?? '').trim() === nextPageNum)
        : null;

    let navigationMethod: 'page-number' | 'next-button' | 'stop' = 'stop';
    if (nextPageBtn && !isDisabled(nextPageBtn)) navigationMethod = 'page-number';
    else if (findNextButton() && !isDisabled(findNextButton() as HTMLElement)) {
      navigationMethod = 'next-button';
    }

    console.log('[chatworthy][recipe] page', {
      pageIndex: pageNum ?? pageKey,
      recipesFound: links.length,
      cumulativeTotal: urls.size,
      navigation: navigationMethod,
    });

    if (navigationMethod === 'stop') {
      stoppedReason = 'no-next';
      break;
    }

    const prevFirstUrl = firstUrl;
    const prevPage = pageNum;

    const doClick = () => {
      const target = navigationMethod === 'page-number' ? nextPageBtn : findNextButton();
      if (target && !isDisabled(target)) target.click();
      return target != null;
    };

    let clicked = doClick();
    if (!clicked) {
      stoppedReason = 'no-next';
      break;
    }

    let changed = await waitForPageChange({
      prevPage,
      prevFirstUrl,
      timeoutMs: 8000,
    });

    if (!changed) {
      await sleep(300);
      clicked = doClick();
      if (clicked) {
        changed = await waitForPageChange({
          prevPage,
          prevFirstUrl,
          timeoutMs: 8000,
        });
      }
    }

    if (!changed) {
      stoppedReason = 'navigation-timeout';
      break;
    }
  }

  if (!stoppedReason) stoppedReason = 'max-pages';

  console.log('[chatworthy][recipe] stop', { stoppedReason, pagesVisited, total: urls.size });

  return {
    urls: Array.from(urls),
    pagesVisited,
    pageSize,
    totalResultsText,
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

  if (dryRun) {
    await saveProgress(progress);
    sendDownload(URLS_FILE, discovered);
    return {
      totalDiscovered: discovered.length,
      pagesVisited: discovery.pagesVisited,
      pageSize: discovery.pageSize,
      totalResultsText: discovery.totalResultsText,
      stoppedReason: discovery.stoppedReason,
      dryRun: true,
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
