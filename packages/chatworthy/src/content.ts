// Mark as a module (good for TS/isolatedModules)

import { getChatTitleAndProject } from './domExtractors';
import { getSite, getChatTitle, getMessageTuples as getSiteMessageTuples } from './siteAdapters';
import { buildMarkdownExport } from '@chatorama/chat-md-core';
import type { ExportTurn, ExportNoteMetadata } from '@chatorama/chat-md-core';
import { API_BASE } from './config';

/**
 * ------------------------------------------------------------
 *  chatworthy Content Script (v2 — Chatalog-ready)
 *  - Floating “Export” UI (collapsible)
 *  - Robust observer for new messages
 *  - Relabels "You/ChatGPT" -> "Prompt/Response"
 *  - Works even when the page lacks data-message-author-role (uses our own tags)
 *  - Click an item in the list to scroll to that Prompt
 *  - Selected list item highlights on click + follows scrolling
 *  - NEW: Draggable floating UI with persisted position
 * ------------------------------------------------------------
 */

// ---- Config ------------------------------------------------

const ROOT_ID = 'chatworthy-root';
const LIST_ID = 'chatworthy-list';
const CONTROLS_ID = 'chatworthy-controls';
const EXPORT_BTN_ID = 'chatworthy-export-btn';
const TOGGLE_BTN_ID = 'chatworthy-toggle-btn';
const ALL_BTN_ID = 'chatworthy-all-btn';
const NONE_BTN_ID = 'chatworthy-none-btn';
const DRAG_HANDLE_ID = 'chatworthy-drag-handle';
const STATUS_ROW_ID = 'chatworthy-status-row';
const STATUS_TOGGLE_ID = 'chatworthy-status-toggle-btn';
const STATUS_TOGGLE_REVIEW_ID = 'chatworthy-status-review-btn';

const OBSERVER_THROTTLE_MS = 200;
const COLLAPSE_LS_KEY = 'chatworthy:collapsed';
const POS_LS_KEY = 'chatworthy:position';
const STATUS_LS_KEY = 'chatworthy:statusRow';

// ---- List selection / scroll-follow state ------------------

let selectedListItem: HTMLDivElement | null = null;
let listItemByTupleIndex = new Map<number, HTMLDivElement>();

let io: IntersectionObserver | null = null;
let ioIntersecting = new Map<number, HTMLElement>(); // tupleIndex -> prompt element
let ioTrackedEls: Array<{ idx: number; el: HTMLElement }> = []; // all observed elements (fallback)
let ioUpdateScheduled = false;
let ioScrollCleanup: (() => void) | null = null; // removes the scroller scroll listener

let lastManualSelectAt = 0;
const MANUAL_GRACE_MS = 800;

// ChatGPT virtual-scroll state: tracks whether we ever warned about hidden turns
// so we can show a brief "all loaded" confirmation once they appear.
let chatgptScrollWarnActive = false;
let chatgptAllLoadedAt = 0;

// The ChatGPT DOM element the user last manually selected in the sidebar.
// Persists across list rebuilds so the same item can be re-selected even after
// new lazy-loaded turns shift all indices.
let manuallySelectedChatEl: HTMLElement | null = null;
// Stable key (see getChatgptTurnKey) of the last manually selected ChatGPT item.
// Used for post-rebuild restoration because ChatGPT recreates DOM nodes on reload,
// making element-reference matching unreliable.
let manuallySelectedTurnKey: string | null = null;

// ---- ChatGPT virtual-scroll prompt tracking ----------------
// ChatGPT keeps only a sliding window of ~5 exchanges in the DOM and removes the
// rest as you scroll. To keep the sidebar complete we cache every prompt seen,
// keyed by a stable per-exchange key, and reconstruct their order from the
// windows we observe: each window is a contiguous run, overlapping runs merge,
// and a run with no overlap (after a scrollbar jump) becomes its own segment.
// More than one segment means there is a gap of not-yet-seen prompts.

type CachedChatgptPrompt = { text: string; el: HTMLElement; responseEls: HTMLElement[] };
const chatgptPromptCache = new Map<string, CachedChatgptPrompt>();
let chatgptCachedChatId: string | null = null;
// Known prompt order as contiguous segments, oldest first.
let chatgptSegments: string[][] = [];
// Key of the conversation's first exchange, once it has been seen.
let chatgptFirstTurnKey: string | null = null;
// Previous observed window, for placing a non-overlapping window by scroll direction.
let chatgptPrevRun: string[] = [];
let chatgptPrevScrollTop: number | null = null;
// Incremented on each stale-item click so an older walk-to-turn loop stops.
let chatgptWalkToken = 0;

// Current DOM: [data-turn-key] wraps one exchange. Older DOM: one
// [data-testid="conversation-turn-N"] per message.
function getChatgptTurnKey(el: HTMLElement): string | null {
  const turn = el.closest<HTMLElement>('[data-turn-key]');
  if (turn) return turn.getAttribute('data-turn-key');
  const legacy = el.closest<HTMLElement>('[data-testid^="conversation-turn-"]');
  return legacy ? legacy.getAttribute('data-testid') : null;
}

// Older DOM numbers turns, so the first one is known directly. The current DOM has
// no reliable marker (its "fallback-turn-N" keys restart with each loaded batch), so
// there the first exchange is confirmed by confirmChatgptTopWhenSettled instead.
function isChatgptFirstTurn(el: HTMLElement): boolean {
  return el.closest('[data-testid="conversation-turn-1"]') !== null;
}

function isScrolledToTop(sc: HTMLElement): boolean {
  const maxScroll = Math.max(sc.scrollHeight - sc.clientHeight, 0);
  const reversed = getComputedStyle(sc).flexDirection === 'column-reverse';
  return reversed ? sc.scrollTop <= -maxScroll + 2 : sc.scrollTop <= 2;
}

// When the thread is scrolled to the top and nothing older loads within 2s, the
// topmost exchange is the conversation's first.
let chatgptTopCheckTimer: number | null = null;
function topmostChatgptTurnKey(sc: HTMLElement): string | null {
  const top = Array.from(sc.querySelectorAll<HTMLElement>('[data-turn-key]')).find(t => t.checkVisibility());
  return top?.getAttribute('data-turn-key') ?? null;
}

function confirmChatgptTopWhenSettled(sc: HTMLElement) {
  if (chatgptFirstTurnKey || chatgptTopCheckTimer !== null || !isScrolledToTop(sc)) return;
  const topKey = topmostChatgptTurnKey(sc);
  if (!topKey) return;
  const chatId = chatgptCachedChatId;
  const height = sc.scrollHeight;
  chatgptTopCheckTimer = window.setTimeout(() => {
    chatgptTopCheckTimer = null;
    if (
      chatId === chatgptCachedChatId && sc.isConnected && isScrolledToTop(sc) &&
      sc.scrollHeight === height && topmostChatgptTurnKey(sc) === topKey &&
      chatgptPromptCache.has(topKey)
    ) {
      chatgptFirstTurnKey = topKey;
      moveFirstTurnSegmentToFront();
      scheduleEnsure();
    }
  }, 2000);
}

function moveFirstTurnSegmentToFront() {
  if (!chatgptFirstTurnKey) return;
  const firstIdx = chatgptSegments.findIndex(seg => seg.includes(chatgptFirstTurnKey!));
  if (firstIdx > 0) chatgptSegments.unshift(...chatgptSegments.splice(firstIdx, 1));
}

function findLiveChatgptPrompt(key: string): HTMLElement | null {
  const esc = CSS.escape(key);
  const turn =
    document.querySelector<HTMLElement>(`[data-turn-key="${esc}"]`) ||
    document.querySelector<HTMLElement>(`[data-testid="${esc}"]`);
  if (!turn || !turn.checkVisibility()) return null;
  return turn.querySelector<HTMLElement>('[data-chatgpt-search-unit-key$=":user"]') ?? turn;
}

// Union of two contiguous runs that share at least one key, or null if disjoint.
// On disagreement, `b` (the fresher observation) wins.
function mergeChatgptRuns(a: string[], b: string[]): string[] | null {
  const common = b.find(k => a.includes(k));
  if (common === undefined) return null;
  const ia = a.indexOf(common);
  const ib = b.indexOf(common);
  const byPos = new Map<number, string>();
  a.forEach((k, i) => byPos.set(i - ia, k));
  b.forEach((k, i) => byPos.set(i - ib, k));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const pos of Array.from(byPos.keys()).sort((x, y) => x - y)) {
    const k = byPos.get(pos)!;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function recordChatgptRun(run: string[], scrollTop: number | null) {
  if (run.length === 0) return;

  let merged = run;
  let insertAt = -1;
  const rest: string[][] = [];
  for (const seg of chatgptSegments) {
    const m = mergeChatgptRuns(seg, merged);
    if (m) {
      merged = m;
      if (insertAt === -1) insertAt = rest.length;
    } else {
      rest.push(seg);
    }
  }

  if (insertAt === -1) {
    // Disjoint window: place it next to the previous window, older if we scrolled up.
    const scrolledUp =
      scrollTop !== null && chatgptPrevScrollTop !== null && scrollTop < chatgptPrevScrollTop;
    const prevIdx = chatgptPrevRun.length ? rest.findIndex(seg => seg.includes(chatgptPrevRun[0])) : -1;
    if (prevIdx === -1) insertAt = scrolledUp ? 0 : rest.length;
    else insertAt = scrolledUp ? prevIdx : prevIdx + 1;
  }
  rest.splice(insertAt, 0, merged);

  chatgptSegments = rest;
  // The segment holding the first exchange is always the oldest.
  moveFirstTurnSegmentToFront();
  chatgptPrevRun = run;
  chatgptPrevScrollTop = scrollTop;
}

// True when every prompt from the first exchange onward has been seen with no gaps.
function chatgptAllPromptsSeen(): boolean {
  return chatgptSegments.length === 1 && chatgptFirstTurnKey !== null &&
    chatgptSegments[0].includes(chatgptFirstTurnKey);
}

function resetChatgptTracking(chatId: string | null) {
  chatgptPromptCache.clear();
  chatgptSegments = [];
  chatgptFirstTurnKey = null;
  chatgptPrevRun = [];
  chatgptPrevScrollTop = null;
  chatgptCachedChatId = chatId;
  chatgptScrollWarnActive = false;
  chatgptAllLoadedAt = 0;
  manuallySelectedChatEl = null;
  manuallySelectedTurnKey = null;
  chatgptWalkToken++;
}

type RegistryStatusState = {
  backendOk: boolean | null;
  registryStatus: string | null;
  lastError: string | null;
  lastChecked: number | null;
  lastChatId: string | null;
};

let statusRowVisible = getInitialStatusRowVisible();
const registryState: RegistryStatusState = {
  backendOk: null,
  registryStatus: null,
  lastError: null,
  lastChecked: null,
  lastChatId: null,
};

function setSelectedListItem(next: HTMLDivElement | null) {
  if (selectedListItem === next) return;

  if (selectedListItem) {
    selectedListItem.classList.remove('chatworthy-item--selected');
  }
  selectedListItem = next;

  if (selectedListItem) {
    selectedListItem.classList.add('chatworthy-item--selected');
    const listEl = document.getElementById(LIST_ID);
    if (listEl) {
      const listRect = listEl.getBoundingClientRect();
      const itemRect = selectedListItem.getBoundingClientRect();
      if (itemRect.bottom > listRect.bottom) {
        listEl.scrollTop += itemRect.bottom - listRect.bottom;
      } else if (itemRect.top < listRect.top) {
        listEl.scrollTop -= listRect.top - itemRect.top;
      }
    }
  }
}

function setSelectedByTupleIndex(tupleIndex: number) {
  const item = listItemByTupleIndex.get(tupleIndex) || null;
  if (item) setSelectedListItem(item);
}

function disconnectPromptVisibilityTracking() {
  if (io) {
    try {
      io.disconnect();
    } catch {
      /* ignore */
    }
  }
  io = null;
  ioIntersecting = new Map();
  ioTrackedEls = [];
  ioUpdateScheduled = false;
  if (ioScrollCleanup) { ioScrollCleanup(); ioScrollCleanup = null; }
}

function scheduleIoPick(scroller: HTMLElement, offset: number) {
  if (ioUpdateScheduled) return;
  ioUpdateScheduled = true;

  requestAnimationFrame(() => {
    ioUpdateScheduled = false;

    if (Date.now() - lastManualSelectAt < MANUAL_GRACE_MS) return;

    const scRect = scroller.getBoundingClientRect();
    const rootTop = scRect.top + offset;

    // Prefer intersecting elements; fall back to all tracked elements when the
    // user has scrolled into the middle of a long response (no prompt visible).
    const candidates: Iterable<[number, HTMLElement]> =
      ioIntersecting.size > 0
        ? ioIntersecting.entries()
        : ioTrackedEls.map(({ idx, el }) => [idx, el] as [number, HTMLElement]);

    let bestIdx: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const [idx, el] of candidates) {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top - rootTop);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }

    if (bestIdx != null) {
      // If the IO is navigating to a different item than what was manually
      // selected, clear the manual state so future buildUI restorations don't
      // keep fighting the IO auto-picker.
      const newItem = listItemByTupleIndex.get(bestIdx);
      if (newItem && newItem !== selectedListItem) {
        manuallySelectedChatEl = null;
        manuallySelectedTurnKey = null;
      }
      setSelectedByTupleIndex(bestIdx);
    }
  });
}

function setupPromptVisibilityTracking() {
  disconnectPromptVisibilityTracking();

  const tuples = getMessageTuples();
  const userTuples = tuples.map((t, idx) => ({ t, idx })).filter(x => x.t.role === 'user');
  if (userTuples.length === 0) return;

  const scroller = findScrollContainer(userTuples[0].t.el);
  const offset = getLocalHeaderOffset(scroller);

  const rootForIO =
    scroller === (document.scrollingElement || document.documentElement) ? null : scroller;

  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const raw = el.getAttribute('data-cw-msgid');
        const tupleIndex = raw != null ? Number(raw) : NaN;
        if (!Number.isFinite(tupleIndex)) continue;

        if (e.isIntersecting) ioIntersecting.set(tupleIndex, el);
        else ioIntersecting.delete(tupleIndex);
      }

      scheduleIoPick(scroller, offset);
    },
    {
      root: rootForIO,
      threshold: [0.01, 0.1, 0.25, 0.5],
    }
  );

  ioTrackedEls = userTuples.map(({ idx, t }) => ({ idx, el: t.el }));
  for (const { t } of userTuples) io.observe(t.el);

  // Fallback: fire a pick on scroll so drag-jumps (which may not trigger IO
  // threshold crossings) still update the sidebar selection.
  const onScroll = () => {
    scheduleIoPick(scroller, offset);
    // Reaching the top loads nothing once the whole chat is cached, so no DOM
    // mutation (and no rebuild) follows — check for the conversation start here too.
    if (getSite() === 'chatgpt') confirmChatgptTopWhenSettled(scroller);
  };
  const scrollTarget = rootForIO ?? window;
  scrollTarget.addEventListener('scroll', onScroll, { passive: true });
  ioScrollCleanup = () => scrollTarget.removeEventListener('scroll', onScroll);
}

// ---- Drag + persisted position -----------------------------

type CwPos = { left: number; top: number };

function readSavedPosition(): CwPos | null {
  try {
    const raw = localStorage.getItem(POS_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CwPos>;
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null;
    if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

function savePosition(pos: CwPos) {
  try {
    localStorage.setItem(POS_LS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function clampPosition(left: number, top: number, root: HTMLElement): CwPos {
  const margin = 8;
  const w = root.offsetWidth || 320;
  const h = root.offsetHeight || 200;

  const maxLeft = Math.max(margin, window.innerWidth - w - margin);
  const maxTop = Math.max(margin, window.innerHeight - h - margin);

  const clampedLeft = Math.min(Math.max(left, margin), maxLeft);
  const clampedTop = Math.min(Math.max(top, margin), maxTop);

  return { left: clampedLeft, top: clampedTop };
}

function applyPosition(root: HTMLElement) {
  // If we have a saved position, use it. Otherwise default to previous right/top values.
  const saved = readSavedPosition();
  if (saved) {
    // switch to left/top positioning if saved
    root.style.right = 'auto';
    root.style.left = `${saved.left}px`;
    root.style.top = `${saved.top}px`;
    return;
  }

  // Default initial placement
  if (!root.style.top) root.style.top = '80px';
  if (!root.style.right) root.style.right = '16px';
  // Ensure left is not set unless user dragged
  if (!root.style.left) root.style.left = 'auto';
}

function makeDraggable(root: HTMLDivElement) {
  const handle = root.querySelector<HTMLDivElement>(`#${DRAG_HANDLE_ID}`);
  if (!handle) return;

  // Avoid double-binding
  if (handle.getAttribute('data-cw-drag-wired') === '1') return;
  handle.setAttribute('data-cw-drag-wired', '1');

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let activePointerId: number | null = null;

  const getCurrentLeftTop = (): CwPos => {
    const rect = root.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const nextLeft = startLeft + dx;
    const nextTop = startTop + dy;

    const clamped = clampPosition(nextLeft, nextTop, root);

    // Ensure left/top are active (not right)
    root.style.right = 'auto';
    root.style.left = `${clamped.left}px`;
    root.style.top = `${clamped.top}px`;
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;

    try {
      if (activePointerId != null) {
        handle.releasePointerCapture?.(activePointerId);
      }
    } catch {
      /* ignore */
    }
    activePointerId = null;

    // Persist final position
    const rect = root.getBoundingClientRect();
    const clamped = clampPosition(rect.left, rect.top, root);
    root.style.left = `${clamped.left}px`;
    root.style.top = `${clamped.top}px`;
    savePosition(clamped);

    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
  };

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    // only left click / primary pointer
    if (e.button !== 0) return;

    dragging = true;
    lastManualSelectAt = Date.now(); // also pause scroll-follow briefly during drag

    const cur = getCurrentLeftTop();

    startX = e.clientX;
    startY = e.clientY;
    startLeft = cur.left;
    startTop = cur.top;
    activePointerId = e.pointerId;

    // Ensure we’re in left/top mode
    root.style.right = 'auto';
    root.style.left = `${cur.left}px`;
    root.style.top = `${cur.top}px`;

    // Prevent text selection while dragging
    e.preventDefault();

    try {
      handle.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
  });

  // If window resizes, clamp the saved position so it stays visible
  const onResize = () => {
    const rect = root.getBoundingClientRect();
    const clamped = clampPosition(rect.left, rect.top, root);
    root.style.right = 'auto';
    root.style.left = `${clamped.left}px`;
    root.style.top = `${clamped.top}px`;
    savePosition(clamped);
  };

  // Avoid double-binding resize
  if (root.getAttribute('data-cw-resize-wired') !== '1') {
    root.setAttribute('data-cw-resize-wired', '1');
    window.addEventListener('resize', onResize);
  }
}

// ---- Repair loop -------------------------------------------

let repairTimer: number | null = null;

function startRepairLoop() {
  if (repairTimer != null) return;
  repairTimer = window.setInterval(() => {
    try {
      ensureFloatingUI();
      if (document.getElementById(LIST_ID)) {
        clearInterval(repairTimer!);
        repairTimer = null;
      }
    } catch {
      /* ignore */
    }
  }, 1500);
}

// ---- Singleton + Killswitch -------------------------------

(() => {
  const w = window as any;

  try {
    const disabled =
      localStorage.getItem('chatworthy:disable') === '1' ||
      new URLSearchParams(location.search).has('chatworthy-disable');
    if (disabled) {
      console.warn('[chatworthy] Disabled by kill switch');
      return;
    }
  } catch {
    /* ignore */
  }

  if (w.__chatworthy_init__) return;
  w.__chatworthy_init__ = true;

  (window as any).cw_getMessageTuples = getMessageTuples;

  if (window.top !== window) return;

  init().catch(err => console.error('[chatworthy] init failed', err));
})();

// ---- Helpers -----------------------------------------------

function getTitle(): string {
  const title = getChatTitle() || document.title || 'Conversation';
  return title.replace(/[\n\r]+/g, ' ');
}

function filenameBase(): string {
  const t = getTitle()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
  ].join('');
  return `${t || 'chat'}-${stamp}`;
}

function getSelectedPromptIndexes(): number[] {
  const root = document.getElementById(ROOT_ID);
  if (!root) return [];
  const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-uindex]'));
  return boxes
    .filter(cb => cb.checked)
    .map(cb => Number(cb.dataset.uindex))
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);
}

// Selected ChatGPT items tracked by turn key (live or virtual-scrolled out),
// returned in conversation order.
function getSelectedChatgptTurnKeys(): string[] {
  const root = document.getElementById(ROOT_ID);
  if (!root) return [];
  const selected = new Set(
    Array.from(root.querySelectorAll<HTMLInputElement>('input.cw-cb[data-cw-turnkey]'))
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.cwTurnkey!)
  );
  return chatgptSegments.flat().filter(k => selected.has(k));
}

function cloneWithoutInjected(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  // Also strip .cdk-visually-hidden (Gemini screen-reader "You said" labels)
  clone.querySelectorAll('.cw-role-label, [data-cw-hidden="1"], .cdk-visually-hidden').forEach(n => n.remove());
  return clone;
}

// ---- Message discovery -------------------------------------

function getMessageTuples(): Array<{ el: HTMLElement; role: 'user' | 'assistant' }> {
  const tuples = getSiteMessageTuples();

  // Stamp data attributes used by the rest of content.ts (scroll tracking, IO observer, etc.)
  tuples.forEach((t, idx) => {
    t.el.setAttribute('data-cw-role', t.role);
    t.el.setAttribute('data-cw-msgid', String(idx));
  });

  return tuples;
}

// ---- Build selected payload --------------------------------

function buildSelectedPayload(): { turns: ExportTurn[]; htmlBodies: string[] } {
  const tuples = getMessageTuples();
  const allEls: HTMLElement[] = tuples.map(t => t.el);
  const allTurns: ExportTurn[] = tuples.map(t => {
    const clean = cloneWithoutInjected(t.el);
    return { role: t.role, text: (clean.textContent ?? '').trim() };
  });

  const raw = getSelectedPromptIndexes();
  let selected = raw
    .map(n => (typeof n === 'string' ? parseInt(n, 10) : Number(n)))
    .filter(n => Number.isFinite(n))
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .sort((a, b) => a - b);

  selected = selected.filter(idx => idx >= 0 && idx < allTurns.length && allTurns[idx].role === 'user');

  const turns: ExportTurn[] = [];
  const htmlBodies: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const uIdx = selected[i];

    const nextUserAfter = allTurns.findIndex((t, k) => k > uIdx && t.role === 'user');
    const userBoundary = nextUserAfter === -1 ? allTurns.length : nextUserAfter;

    const nextSelectedStart = i + 1 < selected.length ? selected[i + 1] : userBoundary;
    const end = Math.min(userBoundary, nextSelectedStart);

    for (let j = uIdx; j < end; j++) {
      const el = allEls[j];
      const cleanEl = cloneWithoutInjected(el);
      turns.push(allTurns[j]);
      htmlBodies.push(cleanEl.outerHTML);
    }
  }

  // ChatGPT items tracked by turn key, live or virtual-scrolled out of the DOM:
  // export each prompt and its responses from the cache, in conversation order.
  for (const key of getSelectedChatgptTurnKeys()) {
    const cached = chatgptPromptCache.get(key);
    if (!cached) continue;
    const parts: Array<{ role: 'user' | 'assistant'; el: HTMLElement }> = [
      { role: 'user', el: cached.el },
      ...cached.responseEls.map(el => ({ role: 'assistant' as const, el })),
    ];
    for (const { role, el } of parts) {
      const cleanEl = cloneWithoutInjected(el);
      turns.push({ role, text: (cleanEl.textContent ?? '').trim() });
      htmlBodies.push(cleanEl.outerHTML);
    }
  }

  if (turns.length === 0) return { turns: [], htmlBodies: [] };
  return { turns, htmlBodies };
}

function getSelectionStats(): { total: number; selected: number } {
  const root = document.getElementById(ROOT_ID);
  if (!root) return { total: 0, selected: 0 };
  const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input.cw-cb'));
  const selected = boxes.filter(cb => cb.checked).length;
  return { total: boxes.length, selected };
}

function updateControlsState() {
  const { total, selected } = getSelectionStats();

  const allBtn = document.getElementById(ALL_BTN_ID) as HTMLButtonElement | null;
  const noneBtn = document.getElementById(NONE_BTN_ID) as HTMLButtonElement | null;
  const expBtn = document.getElementById(EXPORT_BTN_ID) as HTMLButtonElement | null;

  if (allBtn) allBtn.disabled = total > 0 && selected === total;
  if (noneBtn) noneBtn.disabled = selected === 0;
  if (expBtn) expBtn.disabled = selected === 0;
}

// ---- Export helpers ---------------------------------------

function generateNoteId(): string {
  try {
    return `ext-${crypto.randomUUID()}`;
  } catch {
    return `ext-${Math.random().toString(36).slice(2)}${Date.now()}`;
  }
}

function getChatIdFromUrl(href: string): string | undefined {
  // ChatGPT: /c/<id>
  const chatgpt = href.match(/\/c\/([a-zA-Z0-9_-]+)/);
  if (chatgpt) return chatgpt[1];
  // Gemini: /app/<hex-id>
  const gemini = href.match(/\/app\/([a-fA-F0-9]+)/);
  if (gemini) return gemini[1];
  // Claude: /chat/<id> or similar
  const claude = href.match(/\/chat\/([a-zA-Z0-9_-]+)/);
  if (claude) return claude[1];
  return undefined;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTopic(chatTitle?: string, subject?: string): string | undefined {
  if (!chatTitle) return undefined;
  if (!subject) return chatTitle.trim();

  const re = new RegExp(`^\\s*${escapeRegex(subject)}\\s*(?:–|—|-|:)\\s*`, 'iu');
  const stripped = chatTitle.replace(re, '').trim();
  return stripped || chatTitle.trim();
}

function getSubjectTopicAndChatTitle() {
  const { chatTitle, projectName } = getChatTitleAndProject();

  const subject = (projectName || (chatTitle?.split(/ - |:|–|—/)[0]?.trim() ?? '')).trim() || '';
  const topic = normalizeTopic(chatTitle, subject) || 'Untitled Conversation';

  return { subject, topic, chatTitle, projectName };
}

function createExportMeta(turnCount: number): (ExportNoteMetadata & { projectName?: string | null }) {
  const { subject, topic, chatTitle, projectName } = getSubjectTopicAndChatTitle();

  const meta: ExportNoteMetadata & { projectName?: string | null } = {
    noteId: generateNoteId(),
    source: getSite(),
    chatId: getChatIdFromUrl(location.href),
    chatTitle,
    pageUrl: location.href,
    exportedAt: new Date().toISOString(),
    model: undefined,

    subject,
    topic,

    summary: null,
    tags: [],
    autoGenerate: { summary: true, tags: true },

    noteMode: 'auto',
    turnCount,
    splitHints: [],

    author: 'me',
    visibility: 'private',
  };

  if (projectName) {
    meta.projectName = projectName;
  }

  return meta;
}

function buildExportFromTurns(
  turns: ExportTurn[],
  htmlBodies?: string[],
  metaOverride?: ExportNoteMetadata & { projectName?: string | null }
): string {
  const meta = metaOverride ?? createExportMeta(turns.length);

  return buildMarkdownExport(meta, turns, {
    title: meta.chatTitle,
    freeformNotes: '',
    includeFrontMatter: true,
    htmlBodies,
  });
}

function downloadExport(filename: string, data: string | Blob) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// ---- Collapsed state helpers -------------------------------

function getInitialCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(COLLAPSE_LS_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

function setCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_LS_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }

  const root = document.getElementById(ROOT_ID);
  const listEl = document.getElementById(LIST_ID) as HTMLDivElement | null;
  const toggleBtn = document.getElementById(TOGGLE_BTN_ID) as HTMLButtonElement | null;

  if (root) root.setAttribute('data-collapsed', v ? '1' : '0');
  if (listEl) listEl.style.display = v ? 'none' : 'block';
  if (toggleBtn) toggleBtn.textContent = v ? 'Show List' : 'Hide List';
}

function getInitialStatusRowVisible(): boolean {
  try {
    const raw = localStorage.getItem(STATUS_LS_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

function setStatusRowVisible(v: boolean) {
  statusRowVisible = v;
  try {
    localStorage.setItem(STATUS_LS_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  renderStatusRow();
  updateStatusToggleButton();
}

// ---- Registry / status row helpers ------------------------

function renderStatusRow(chatId?: string) {
  const row = document.getElementById(STATUS_ROW_ID) as HTMLDivElement | null;
  if (!row) return;

  row.style.display = statusRowVisible ? 'flex' : 'none';

  const backendLabel =
    registryState.backendOk === true
      ? 'ok'
      : registryState.backendOk === false
        ? 'error'
        : '…';
  const backendNote =
    registryState.backendOk === false && registryState.lastError
      ? ` (${registryState.lastError})`
      : '';
  const registryLabel = registryState.registryStatus ?? '—';
  const cid = chatId || getChatIdFromUrl(location.href) || 'no chatId';

  row.textContent = `chatId: ${cid} • registry: ${registryLabel} • backend: ${backendLabel}${backendNote}`;
  updateStatusToggleButton();
  updateReviewButton();
}

function updateStatusToggleButton() {
  const btn = document.getElementById(STATUS_TOGGLE_ID) as HTMLButtonElement | null;
  if (btn) btn.textContent = statusRowVisible ? 'Hide Status' : 'Show Status';
}

function updateReviewButton() {
  const btn = document.getElementById(STATUS_TOGGLE_REVIEW_ID) as HTMLButtonElement | null;
  if (!btn) return;

  const status = (registryState.registryStatus || '').toUpperCase();
  const isReviewed = status === 'REVIEWED';
  btn.textContent = isReviewed ? 'Mark Unreviewed' : 'Mark Reviewed';
  btn.disabled = registryState.backendOk === false || !registryState.lastChatId;
}

async function refreshRegistryStatus(chatId?: string) {
  const cid = chatId || getChatIdFromUrl(location.href);
  if (!cid) {
    registryState.registryStatus = 'no chatId';
    registryState.backendOk = null;
    renderStatusRow(cid);
    return;
  }

  // Avoid spamming the backend
  if (
    registryState.lastChatId === cid &&
    registryState.lastChecked &&
    Date.now() - registryState.lastChecked < 15000
  ) {
    return;
  }

  registryState.lastChatId = cid;
  registryState.lastChecked = Date.now();

  try {
    const res = await fetch(`${API_BASE}/chat-registry/byChatId/${encodeURIComponent(cid)}`, {
      method: 'GET',
      credentials: 'include',
    });

    registryState.backendOk = res.ok || res.status === 404;
    registryState.lastError = res.ok || res.status === 404 ? null : `status ${res.status}`;

    if (res.ok) {
      const body = await res.json();
      registryState.registryStatus = body?.status ?? 'UNREVIEWED';
    } else if (res.status === 404) {
      registryState.registryStatus = 'UNREGISTERED';
    }
  } catch (err: any) {
    registryState.backendOk = false;
    registryState.lastError = err?.message || 'request failed';
  }

  renderStatusRow(cid);
}

async function toggleRegistryReviewStatus() {
  const chatId = getChatIdFromUrl(location.href);
  if (!chatId) {
    registryState.lastError = 'no chatId';
    renderStatusRow();
    return;
  }

  const current = (registryState.registryStatus || '').toUpperCase();
  const next = current === 'REVIEWED' ? 'UNREVIEWED' : 'REVIEWED';

  try {
    const res = await fetch(`${API_BASE}/chat-registry/${encodeURIComponent(chatId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: next }),
    });
    registryState.backendOk = res.ok;
    if (!res.ok) {
      registryState.lastError = `status ${res.status}`;
      renderStatusRow(chatId);
      return;
    }
    const body = await res.json();
    registryState.registryStatus = body?.status ?? next;
    registryState.lastError = null;
  } catch (err: any) {
    registryState.backendOk = false;
    registryState.lastError = err?.message || 'request failed';
  }

  registryState.lastChatId = chatId;
  registryState.lastChecked = Date.now();
  renderStatusRow(chatId);
}

// ---- Relabel -----------------------------------------------

function hideNativeRoleLabels(container: HTMLElement) {
  const selectors = [
    '[data-testid="author-name"]',
    'header [data-testid]',
    'header span, header div',
    ':scope > header *',
    ':scope > div > span',
    ':scope > div[role="heading"] *',
  ];

  const isRoleWord = (t: string) => {
    const s = t.trim().toLowerCase();
    return s === 'you' || s === 'chatgpt';
  };

  let hidden = 0;

  for (const sel of selectors) {
    container.querySelectorAll<HTMLElement>(sel).forEach(node => {
      const txt = (node.textContent || '').trim();
      if (isRoleWord(txt)) {
        node.style.display = 'none';
        node.setAttribute('data-cw-hidden', '1');
        hidden++;
      }
    });
  }

  if (!hidden) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
    let count = 0;
    while (walker.nextNode() && count < 150) {
      const el = walker.currentNode as HTMLElement;
      const txt = (el.textContent || '').trim();
      if (txt && txt.length <= 16 && isRoleWord(txt)) {
        el.style.display = 'none';
        el.setAttribute('data-cw-hidden', '1');
        hidden++;
        break;
      }
      count++;
    }
  }

  if (!hidden) {
    const prev = container.previousElementSibling as HTMLElement | null;
    if (prev && /header/i.test(prev.tagName)) {
      prev.querySelectorAll<HTMLElement>('span,div,[data-testid]').forEach(node => {
        const txt = (node.textContent || '').trim();
        if (txt.toLowerCase() === 'you' || txt.toLowerCase() === 'chatgpt') {
          node.style.display = 'none';
          node.setAttribute('data-cw-hidden', '1');
          hidden++;
        }
      });
    }
  }
}

function relabelAndRestyleMessages() {
  const tuples = getMessageTuples();

  for (const { el, role } of tuples) {
    hideNativeRoleLabels(el);

    let label = el.querySelector(':scope > .cw-role-label') as HTMLDivElement | null;
    if (!label) {
      label = document.createElement('div');
      label.className = 'cw-role-label';
      label.textContent = role === 'user' ? 'Prompt' : 'Response';
      el.prepend(label);
    }

    el.setAttribute('data-cw-processed', '1');
  }
}

// ---- Jump-to-turn helpers ----------------------------------

function findScrollContainer(start: HTMLElement | null): HTMLElement {
  let el: HTMLElement | null = start;
  while (el) {
    const cs = getComputedStyle(el);
    const canScroll =
      (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight;
    if (canScroll) return el;
    el = el.parentElement;
  }
  return (document.scrollingElement || document.documentElement) as HTMLElement;
}

function getLocalHeaderOffset(scrollEl: HTMLElement): number {
  const rect = scrollEl.getBoundingClientRect();
  const headerCandidates = Array.from(scrollEl.querySelectorAll<HTMLElement>('*')).filter(n => {
    const cs = getComputedStyle(n);
    if (!(cs.position === 'fixed' || cs.position === 'sticky')) return false;
    const r = n.getBoundingClientRect();
    return r.top <= rect.top + 8 && r.height >= 40 && r.height <= 140;
  });
  const h = headerCandidates.reduce((m, n) => Math.max(m, n.getBoundingClientRect().height), 0);
  return (h || 80) + 12;
}

function highlightPrompt(el: HTMLElement) {
  el.classList.add('cw-jump-highlight');
  setTimeout(() => el.classList.remove('cw-jump-highlight'), 1200);
}

// Scrolls ChatGPT toward a prompt that has been virtual-scrolled out of the DOM,
// a step at a time so ChatGPT loads the windows in between, then jumps to it.
async function walkToChatgptTurn(key: string) {
  const token = ++chatgptWalkToken;
  const order = chatgptSegments.flat();
  const targetIdx = order.indexOf(key);
  const liveIdxs = order.map((k, i) => (findLiveChatgptPrompt(k) ? i : -1)).filter(i => i >= 0);
  const anyLive = liveIdxs.length ? findLiveChatgptPrompt(order[liveIdxs[0]]) : null;
  if (targetIdx < 0 || !anyLive) return;

  const scroller = findScrollContainer(anyLive);
  const reversed = getComputedStyle(scroller).flexDirection === 'column-reverse';
  // Older prompts are further up; scrolling up decreases scrollTop in both layouts.
  const up = targetIdx < Math.min(...liveIdxs);
  let lastTop = NaN;
  let stuck = 0;

  for (let i = 0; i < 300 && token === chatgptWalkToken; i++) {
    const el = findLiveChatgptPrompt(key);
    if (el) {
      lastManualSelectAt = Date.now();
      manuallySelectedTurnKey = key;
      scrollPromptEl(el);
      return;
    }
    const maxScroll = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
    const [minTop, maxTop] = reversed ? [-maxScroll, 0] : [0, maxScroll];
    const step = scroller.clientHeight * 1.5 * (up ? -1 : 1);
    scroller.scrollTop = Math.min(Math.max(scroller.scrollTop + step, minTop), maxTop);
    stuck = scroller.scrollTop === lastTop ? stuck + 1 : 0;
    if (stuck >= 8) return; // reached the end without finding it
    lastTop = scroller.scrollTop;
    await new Promise(r => setTimeout(r, 350));
  }
}

function scrollPromptEl(el: HTMLElement) {
  const scroller = findScrollContainer(el);
  const elRect = el.getBoundingClientRect();
  const scRect = scroller.getBoundingClientRect();
  const offset = getLocalHeaderOffset(scroller);
  const current = scroller.scrollTop;
  const targetY = current + (elRect.top - scRect.top) - offset;
  // ChatGPT's thread scroller is flex-direction: column-reverse, where scrollTop is 0
  // at the bottom and negative above it — so clamp to whichever range applies.
  const maxScroll = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
  const reversed = getComputedStyle(scroller).flexDirection === 'column-reverse';
  const [minTop, maxTop] = reversed ? [-maxScroll, 0] : [0, maxScroll];
  scroller.scrollTo({ top: Math.min(Math.max(targetY, minTop), maxTop), behavior: 'smooth' });
  highlightPrompt(el);
}

function scrollPromptIntoViewByIndex(tupleIndex: number) {
  const tuples = getMessageTuples();
  const t = tuples[tupleIndex];
  if (!t || t.role !== 'user') return;
  scrollPromptEl(t.el);
}

// ---- Floating UI -------------------------------------------

function ensureFloatingUI() {
  ensureStyles();
  suspendObservers(true);

  try {
    const d = document;

    // 1) Root — create if missing
    let root = d.getElementById(ROOT_ID) as HTMLDivElement | null;
    if (!root) {
      root = d.createElement('div');
      root.id = ROOT_ID;

      root.style.position = 'fixed';
      root.style.zIndex = '2147483647';
      root.style.background = 'rgba(255,255,255,0.95)';
      root.style.padding = '8px';
      root.style.borderRadius = '8px';
      root.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      root.style.display = 'flex';
      root.style.flexDirection = 'column';
      root.style.gap = '8px';
      root.style.maxWidth = '420px';

      (d.body || d.documentElement).appendChild(root);

      // Apply persisted (or default) position
      applyPosition(root);

      // default collapsed state
      setCollapsed(getInitialCollapsed());
    } else {
      // Ensure position is applied (if the script hot-reloads / DOM changes)
      applyPosition(root);
    }

    // 1b) Drag handle (create once)
    let dragHandle = root.querySelector<HTMLDivElement>(`#${DRAG_HANDLE_ID}`);
    if (!dragHandle) {
      dragHandle = d.createElement('div');
      dragHandle.id = DRAG_HANDLE_ID;
      dragHandle.textContent = 'Chatworthy';
      root.prepend(dragHandle);
    }

    // Wire drag behavior (idempotent)
    makeDraggable(root);

    const chatId = getChatIdFromUrl(location.href);

    // 1c) Status row (above controls)
    let statusRow = d.getElementById(STATUS_ROW_ID) as HTMLDivElement | null;
    if (!statusRow) {
    statusRow = d.createElement('div');
    statusRow.id = STATUS_ROW_ID;
    statusRow.style.display = statusRowVisible ? 'flex' : 'none';
    statusRow.style.flexDirection = 'column';
    statusRow.style.gap = '4px';
    statusRow.style.fontSize = '11px';
    statusRow.style.color = '#111';
    statusRow.style.background = 'rgba(0,0,0,0.03)';
    statusRow.style.border = '1px solid rgba(0,0,0,0.08)';
    statusRow.style.borderRadius = '6px';
    statusRow.style.padding = '6px';
    root.appendChild(statusRow);
  } else if (!statusRow.parentElement) {
    root.appendChild(statusRow);
  }

  renderStatusRow(chatId);

    // 2) Controls
    let controls = d.getElementById(CONTROLS_ID) as HTMLDivElement | null;
    if (!controls) {
      controls = d.createElement('div');
      controls.id = CONTROLS_ID;
      controls.style.display = 'flex';
      controls.style.alignItems = 'center';
      controls.style.justifyContent = 'flex-end';
      controls.style.gap = '6px';
      controls.style.flexWrap = 'nowrap';
      controls.style.width = '100%';

      const toggleBtn = d.createElement('button');
      toggleBtn.id = TOGGLE_BTN_ID;
      toggleBtn.type = 'button';
      toggleBtn.textContent = root.getAttribute('data-collapsed') === '1' ? 'Show List' : 'Hide List';
      toggleBtn.style.fontWeight = '600';
      toggleBtn.onclick = () => {
        const isCollapsed = root!.getAttribute('data-collapsed') !== '0';
        setCollapsed(!isCollapsed);
      };

      const btnAll = d.createElement('button');
      btnAll.id = ALL_BTN_ID;
      btnAll.type = 'button';
      btnAll.textContent = 'All';
      btnAll.onclick = () => {
        root!.querySelectorAll<HTMLInputElement>('input.cw-cb').forEach(cb => (cb.checked = true));
        updateControlsState();
      };

      const btnNone = d.createElement('button');
      btnNone.id = NONE_BTN_ID;
      btnNone.type = 'button';
      btnNone.textContent = 'None';
      btnNone.onclick = () => {
        root!.querySelectorAll<HTMLInputElement>('input.cw-cb').forEach(cb => (cb.checked = false));
        updateControlsState();
      };

      const statusToggle = d.createElement('button');
      statusToggle.id = STATUS_TOGGLE_ID;
      statusToggle.type = 'button';
      statusToggle.textContent = statusRowVisible ? 'Hide Status' : 'Show Status';
      statusToggle.onclick = () => setStatusRowVisible(!statusRowVisible);

      const reviewToggle = d.createElement('button');
      reviewToggle.id = STATUS_TOGGLE_REVIEW_ID;
      reviewToggle.type = 'button';
      reviewToggle.textContent = 'Mark Reviewed';
      reviewToggle.onclick = () => {
        void toggleRegistryReviewStatus();
      };

      const exportBtn = d.createElement('button');
      exportBtn.id = EXPORT_BTN_ID;
      exportBtn.type = 'button';
      exportBtn.textContent = 'Export';
      exportBtn.onclick = () => {
        try {
          const { turns, htmlBodies } = buildSelectedPayload();
          if (turns.length === 0) {
            alert('Select at least one prompt to export.');
            return;
          }
          const meta = createExportMeta(turns.length);
          const md = buildExportFromTurns(turns, htmlBodies, meta);
          downloadExport(`${filenameBase()}.md`, md);
        } catch (err) {
          console.error('[chatworthy] export failed:', err);
          alert('Export failed — see console for details.');
        }
      };

      controls.appendChild(toggleBtn);
      controls.appendChild(btnAll);
      controls.appendChild(btnNone);
      controls.appendChild(statusToggle);
      controls.appendChild(reviewToggle);
      controls.appendChild(exportBtn);
      root.appendChild(controls);
    } else {
      const toggle = controls.querySelector('#' + TOGGLE_BTN_ID) as HTMLButtonElement | null;
      if (toggle) toggle.textContent = root.getAttribute('data-collapsed') === '1' ? 'Show List' : 'Hide List';
      updateStatusToggleButton();
      updateReviewButton();
    }

    if (statusRow && controls) {
      root.insertBefore(statusRow, controls);
    }

    // 3) List
    let list = d.getElementById(LIST_ID) as HTMLDivElement | null;
    if (!list) {
      list = d.createElement('div');
      list.id = LIST_ID;
      list.style.display = root.getAttribute('data-collapsed') === '1' ? 'none' : 'block';
      list.style.overflow = 'auto';
      list.style.maxHeight = '50vh';
      list.style.minWidth = '220px';
      list.style.padding = '4px 8px 4px 8px';
      root.appendChild(list);
    }

    // Ensure role tags exist
    relabelAndRestyleMessages();

    void refreshRegistryStatus(chatId);

    // 4) Populate list from tuples
    // Keep ChatGPT selections across rebuilds (the list is rebuilt on every DOM change).
    const prevCheckedKeys = new Set(
      Array.from(list.querySelectorAll<HTMLInputElement>('input.cw-cb[data-cw-turnkey]'))
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.cwTurnkey!)
    );
    list.innerHTML = '';

    listItemByTupleIndex = new Map();
    setSelectedListItem(null);

    const tuples = getMessageTuples();
    const userTuples: Array<{ idx: number; el: HTMLElement }> = [];
    tuples.forEach((t, idx) => {
      if (t.role === 'user') userTuples.push({ idx, el: t.el });
    });

    const promptText = (el: HTMLElement) => {
      const clone = el.cloneNode(true) as HTMLElement;
      // Also strip .cdk-visually-hidden (Gemini screen-reader "You said" labels)
      clone.querySelectorAll('.cw-role-label,[data-cw-hidden="1"],.cdk-visually-hidden').forEach(n => n.remove());
      return (clone.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    };

    // For ChatGPT: cache every prompt (and its responses) seen, keyed by turn key, and
    // record the current window's order. Keeps the sidebar complete when ChatGPT's
    // virtual scrolling removes exchanges from the DOM.
    if (getSite() === 'chatgpt') {
      if (chatId !== chatgptCachedChatId) resetChatgptTracking(chatId ?? null);

      const run: string[] = [];
      for (const { idx, el } of userTuples) {
        const key = getChatgptTurnKey(el);
        if (!key) continue;
        run.push(key);
        if (isChatgptFirstTurn(el)) chatgptFirstTurnKey = key;
        const responseEls: HTMLElement[] = [];
        for (let j = idx + 1; j < tuples.length && tuples[j].role === 'assistant'; j++) {
          responseEls.push(tuples[j].el);
        }
        chatgptPromptCache.set(key, { text: promptText(el), el, responseEls });
      }
      const scroller = userTuples.length ? findScrollContainer(userTuples[0].el) : null;
      recordChatgptRun(run, scroller ? scroller.scrollTop : null);
      if (scroller) confirmChatgptTopWhenSettled(scroller);

      // Warn until every prompt from the first exchange on has been seen without gaps,
      // then briefly confirm.
      if (chatgptPromptCache.size > 0) {
        if (!chatgptAllPromptsSeen()) {
          chatgptScrollWarnActive = true;
          chatgptAllLoadedAt = 0;
          const notice = d.createElement('div');
          notice.style.cssText =
            'font-size:11px;padding:0 0 6px 0;color:#b35c00;line-height:1.4;';
          notice.textContent = '⚠ Scroll through the chat to load all prompts';
          list.appendChild(notice);
        } else if (chatgptScrollWarnActive) {
          if (chatgptAllLoadedAt === 0) chatgptAllLoadedAt = Date.now();
          if (Date.now() - chatgptAllLoadedAt < 2500) {
            const notice = d.createElement('div');
            notice.style.cssText =
              'font-size:11px;padding:0 0 6px 0;color:#2e7d32;line-height:1.4;';
            notice.textContent = `✓ All ${chatgptPromptCache.size} prompts loaded`;
            list.appendChild(notice);
          } else {
            chatgptScrollWarnActive = false;
            chatgptAllLoadedAt = 0;
          }
        }
      }
    }

    // Build the flat list of items to render. For ChatGPT, list cached prompts in
    // reconstructed order (marking gaps between segments), plus any live prompt that
    // has no turn key. For other sites, use the live DOM tuples directly.
    type ListEntry = {
      idx: number; el: HTMLElement; text: string; live: boolean;
      turnKey: string | null; gapBefore: boolean;
    };
    const listEntries: ListEntry[] = [];

    if (getSite() === 'chatgpt' && chatgptPromptCache.size > 0) {
      const liveIdxByEl = new Map(userTuples.map(({ idx, el }) => [el, idx]));
      chatgptSegments.forEach((seg, segIdx) => {
        seg.forEach((key, i) => {
          const cached = chatgptPromptCache.get(key);
          if (!cached) return;
          const idx = liveIdxByEl.get(cached.el) ?? -1;
          listEntries.push({
            idx, el: cached.el, text: cached.text, live: idx >= 0 && document.contains(cached.el),
            turnKey: key, gapBefore: segIdx > 0 && i === 0,
          });
        });
      });
      for (const { idx, el } of userTuples) {
        if (getChatgptTurnKey(el) === null) {
          listEntries.push({ idx, el, text: promptText(el), live: true, turnKey: null, gapBefore: false });
        }
      }
    } else {
      for (const { idx, el } of userTuples) {
        listEntries.push({ idx, el, text: promptText(el), live: true, turnKey: null, gapBefore: false });
      }
    }

    if (listEntries.length === 0) {
      const empty = d.createElement('div');
      empty.textContent = 'No prompts detected yet.';
      empty.style.opacity = '0.7';
      empty.style.fontSize = '12px';
      list.appendChild(empty);
    } else {
      for (const { idx, el: node, text, live, turnKey, gapBefore } of listEntries) {
        if (gapBefore) {
          const gap = d.createElement('div');
          gap.textContent = '··· not loaded yet — scroll to load ···';
          gap.style.cssText = 'font-size:11px;color:#b35c00;opacity:0.85;margin:4px 0;';
          list.appendChild(gap);
        }

        const item = d.createElement('div');
        item.className = 'chatworthy-item';
        item.style.display = 'flex';
        item.style.alignItems = 'flex-start';
        item.style.gap = '6px';
        item.style.margin = '4px 0';
        item.style.cursor = 'pointer';
        item.setAttribute('role', 'button');
        item.tabIndex = 0;

        const cb = d.createElement('input');
        cb.type = 'checkbox';
        cb.classList.add('cw-cb');
        cb.addEventListener('change', updateControlsState);
        if (turnKey !== null) {
          cb.dataset.cwTurnkey = turnKey;
          cb.checked = prevCheckedKeys.has(turnKey);
        } else if (live && idx >= 0) {
          cb.dataset.uindex = String(idx);
        }
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('keydown', (e) => e.stopPropagation());
        item.appendChild(cb);

        const span = d.createElement('span');
        span.className = 'chatworthy-item-text';
        span.textContent = text;
        span.style.lineHeight = '1.2';
        item.appendChild(span);

        if (live && idx >= 0) {
          // Fully interactive: IO selection, precise click-to-scroll
          listItemByTupleIndex.set(idx, item);

          const select = () => {
            chatgptWalkToken++; // cancel any walk in progress
            lastManualSelectAt = Date.now();
            manuallySelectedChatEl = node;
            manuallySelectedTurnKey = turnKey;
            setSelectedListItem(item);
            scrollPromptEl(node);
          };

          item.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName.toLowerCase() === 'input') return;
            select();
          });

          item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              select();
            }
          });
        } else if (turnKey !== null) {
          // Cached item no longer in the DOM: walk ChatGPT's scroll toward it until it
          // loads, then jump to it.
          item.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName.toLowerCase() === 'input') return;
            lastManualSelectAt = Date.now();
            manuallySelectedTurnKey = turnKey;
            manuallySelectedChatEl = null;
            setSelectedListItem(item);
            void walkToChatgptTurn(turnKey);
          });
        }

        list.appendChild(item);
      }

      // After rebuild, re-select the item the user last clicked (if still live).
      // Prefer turn-key matching (stable across ChatGPT element re-creation)
      // and fall back to element-reference matching for non-ChatGPT sites.
      //
      // The grace period (MANUAL_GRACE_MS) is set by the original user CLICK and
      // must NOT be renewed here — doing so would let repeated rebuilds
      // continuously suppress the IO auto-picker even when the user has scrolled
      // away.  When the grace has already expired we also clear the manual state
      // so future rebuilds stop fighting the IO.
      {
        const graceActive = Date.now() - lastManualSelectAt < MANUAL_GRACE_MS;
        if (!graceActive) {
          // Grace expired: clear manual state so we stop restoring a stale pick.
          manuallySelectedTurnKey = null;
          manuallySelectedChatEl = null;
        }

        let restoredItem: HTMLDivElement | null = null;

        if (manuallySelectedTurnKey !== null) {
          const matchEntry = listEntries.find(
            ({ turnKey, live }) => live && turnKey === manuallySelectedTurnKey
          );
          if (matchEntry && matchEntry.idx >= 0) {
            restoredItem = listItemByTupleIndex.get(matchEntry.idx) ?? null;
            // Keep element ref in sync if ChatGPT gave the turn a new DOM node
            if (restoredItem && matchEntry.el !== manuallySelectedChatEl) {
              manuallySelectedChatEl = matchEntry.el;
            }
          }
        }

        if (!restoredItem && manuallySelectedChatEl !== null) {
          const matchEntry = listEntries.find(({ el, live }) => live && el === manuallySelectedChatEl);
          if (matchEntry && matchEntry.idx >= 0) {
            restoredItem = listItemByTupleIndex.get(matchEntry.idx) ?? null;
          }
        }

        if (restoredItem) {
          // Restore the visual selection but do NOT update lastManualSelectAt.
          // The grace period belongs to the original click, not to this internal op.
          setSelectedListItem(restoredItem);
        }
      }
    }

    updateControlsState();
    relabelAndRestyleMessages();

    setupPromptVisibilityTracking();
  } finally {
    suspendObservers(false);
  }
}

function ensureStyles() {
  const STYLE_ID = 'chatworthy-styles';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  /* Drag handle */
  #${ROOT_ID} #${DRAG_HANDLE_ID} {
    cursor: grab;
    user-select: none;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(0,0,0,0.04);
    border: 1px solid rgba(0,0,0,0.10);
  }
  #${ROOT_ID} #${DRAG_HANDLE_ID}:active {
    cursor: grabbing;
  }

  /* Floating UI buttons */
  #${ROOT_ID} button {
    padding: 4px 8px;
    border: 1px solid rgba(0,0,0,0.2);
    border-radius: 6px;
    background: white;
    font-size: 12px;
    line-height: 1.2;
  }
  #${ROOT_ID} button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(100%);
  }

  /* Row + checkbox cursors */
  #${ROOT_ID} .chatworthy-item { cursor: pointer; }
  #${ROOT_ID} .chatworthy-item input[type="checkbox"] { cursor: pointer; margin-left: 2px; }
  /* ChatGPT's page CSS sets appearance:none and 0x0 on checkboxes; restore native ones */
  #${ROOT_ID} input[type="checkbox"] {
    appearance: auto !important;
    -webkit-appearance: checkbox !important;
    display: inline-block !important;
    width: 13px !important;
    height: 13px !important;
    min-width: 13px !important;
    flex: 0 0 auto !important;
    opacity: 1 !important;
    visibility: visible !important;
  }

  /* Selected list item */
  #${ROOT_ID} .chatworthy-item--selected .chatworthy-item-text {
    color: rgba(59,130,246,1);
    font-weight: 600;
  }

  /* Label spacing on turns */
  [data-cw-role] > .cw-role-label {
    display:block !important;
    margin: 0 0 6px 0 !important;
    font-weight:600 !important;
  }

  /* Status row */
  #${ROOT_ID} #${STATUS_ROW_ID} {
    line-height: 1.4;
  }

  /* Subtle “jump” highlight on the scrolled-to Prompt */
  @keyframes cwJumpFlash {
    0%   { box-shadow: 0 0 0 2px rgba(59,130,246,.35), inset 0 0 0 9999px rgba(59,130,246,.08); }
    100% { box-shadow: 0 0 0 0 rgba(59,130,246,0),      inset 0 0 0 0 rgba(59,130,246,0); }
  }
  [data-cw-role="user"].cw-jump-highlight {
    animation: cwJumpFlash 1100ms ease-out 1;
    border-radius: 10px;
  }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// ---- Observer + scheduling ---------------------------------

let mo: MutationObserver | null = null;
let observersSuspended = false;
let lastObserverRun = 0;
let scheduled = false;

function suspendObservers(v: boolean) {
  observersSuspended = v;
}

function makeObserver(): MutationObserver {
  return new MutationObserver((mutationList) => {
    if (observersSuspended) return;

    const root = document.getElementById(ROOT_ID);
    if (root) {
      for (const m of mutationList) {
        const target = m.target as Node;
        if (root.contains(target)) return;
      }
    }

    const now = performance.now();
    if (now - lastObserverRun < OBSERVER_THROTTLE_MS) return;
    lastObserverRun = now;

    scheduleEnsure();
  });
}

function startObserving() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof MutationObserver === 'undefined') return;

  const target = document.body || document.documentElement;
  if (!target) return;

  if (!mo) mo = makeObserver();
  try {
    mo.disconnect();
  } catch {
    /* ignore */
  }
  mo.observe(target, { childList: true, subtree: true });
}

function scheduleEnsure() {
  if (scheduled) return;
  scheduled = true;

  requestAnimationFrame(() => {
    const run = () => {
      scheduled = false;
      ensureFloatingUI();
      relabelAndRestyleMessages();
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(run, { timeout: 1500 });
    } else {
      run();
    }
  });
}

// ---- Init --------------------------------------------------

async function init() {
  const host = location.host || '';
  const allowedHosts = /^(chatgpt\.com|chat\.openai\.com|gemini\.google\.com|claude\.ai)$/i;
  if (!allowedHosts.test(host)) {
    console.warn('[chatworthy] Host not allowed; skipping init:', host);
    return;
  }

  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    );
  }

  console.log('[chatworthy] content script active');
  startObserving();
  scheduleEnsure();
  startRepairLoop();
}
