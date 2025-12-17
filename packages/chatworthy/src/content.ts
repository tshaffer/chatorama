// Mark as a module (good for TS/isolatedModules)

import { getChatTitleAndProject } from './domExtractors';
import { buildMarkdownExport } from '@chatorama/chat-md-core';
import type { ExportTurn, ExportNoteMetadata } from '@chatorama/chat-md-core';

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

const OBSERVER_THROTTLE_MS = 200;
const COLLAPSE_LS_KEY = 'chatworthy:collapsed';
const POS_LS_KEY = 'chatworthy:position';

// ---- List selection / scroll-follow state ------------------

let selectedListItem: HTMLDivElement | null = null;
let listItemByTupleIndex = new Map<number, HTMLDivElement>();

let io: IntersectionObserver | null = null;
let ioIntersecting = new Map<number, HTMLElement>(); // tupleIndex -> prompt element
let ioUpdateScheduled = false;

let lastManualSelectAt = 0;
const MANUAL_GRACE_MS = 800;

function setSelectedListItem(next: HTMLDivElement | null) {
  if (selectedListItem === next) return;

  if (selectedListItem) {
    selectedListItem.classList.remove('chatworthy-item--selected');
  }
  selectedListItem = next;

  if (selectedListItem) {
    selectedListItem.classList.add('chatworthy-item--selected');
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
  ioUpdateScheduled = false;
}

function scheduleIoPick(scroller: HTMLElement, offset: number) {
  if (ioUpdateScheduled) return;
  ioUpdateScheduled = true;

  requestAnimationFrame(() => {
    ioUpdateScheduled = false;

    if (Date.now() - lastManualSelectAt < MANUAL_GRACE_MS) return;
    if (ioIntersecting.size === 0) return;

    const scRect = scroller.getBoundingClientRect();
    const rootTop = scRect.top + offset;

    let bestIdx: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (const [idx, el] of ioIntersecting.entries()) {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top - rootTop);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }

    if (bestIdx != null) setSelectedByTupleIndex(bestIdx);
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

  for (const { t } of userTuples) io.observe(t.el);
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
      handle.releasePointerCapture?.(1);
    } catch {
      /* ignore */
    }

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

    // Ensure we’re in left/top mode
    root.style.right = 'auto';
    root.style.left = `${cur.left}px`;
    root.style.top = `${cur.top}px`;

    // Prevent text selection while dragging
    e.preventDefault();

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
  const h1 = document.querySelector('h1, header h1, [data-testid="conversation-title"]');
  const title = (h1?.textContent || document.title || 'ChatGPT Conversation').trim();
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

function cloneWithoutInjected(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cw-role-label, [data-cw-hidden="1"]').forEach(n => n.remove());
  return clone;
}

// ---- Message discovery -------------------------------------

function getMessageTuples(): Array<{ el: HTMLElement; role: 'user' | 'assistant' }> {
  const chosen: Array<{ el: HTMLElement; role: 'user' | 'assistant' }> = [];
  const seen = new Set<HTMLElement>();

  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    ['[data-testid="conversation-turn"]', '[data-message-id]', '[data-message-author-role]'].join(',')
  ));

  const pickRoot = (n: HTMLElement): HTMLElement =>
    n.closest<HTMLElement>('[data-testid="conversation-turn"]') ||
    n.closest<HTMLElement>('[data-message-id]') ||
    n.closest<HTMLElement>('article, li, section') ||
    n;

  const roleOf = (root: HTMLElement): 'user' | 'assistant' => {
    const attrNode = root.matches('[data-message-author-role]')
      ? root
      : root.querySelector<HTMLElement>('[data-message-author-role]');
    const raw = (attrNode?.getAttribute('data-message-author-role') || '').toLowerCase();
    if (raw === 'user' || raw === 'assistant') return raw as 'user' | 'assistant';
    if (root.querySelector('.user-message-bubble-color')) return 'user';
    if (root.matches('.items-end, [class*="items-end"]') || root.querySelector('.items-end, [class*="items-end"]')) {
      return 'user';
    }
    return 'assistant';
  };

  for (const node of candidates) {
    const root = pickRoot(node);
    if (seen.has(root)) continue;
    seen.add(root);

    const role = roleOf(root);
    root.setAttribute('data-cw-role', role);
    root.setAttribute('data-cw-msgid', String(chosen.length));

    chosen.push({ el: root, role });
  }

  if (!chosen.some(c => c.role === 'assistant')) {
    const extras = Array.from(document.querySelectorAll<HTMLElement>('.markdown, .prose, [data-testid="markdown"]'));
    for (const md of extras) {
      const inUser = md.closest('[data-cw-role="user"], .items-end, [class*="items-end"]');
      if (inUser) continue;
      const root = pickRoot(md);
      if (seen.has(root)) continue;
      seen.add(root);
      root.setAttribute('data-cw-role', 'assistant');
      root.setAttribute('data-cw-msgid', String(chosen.length));
      chosen.push({ el: root, role: 'assistant' });
    }
  }

  return chosen;
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
  if (selected.length === 0) return { turns: [], htmlBodies: [] };

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

  return { turns, htmlBodies };
}

function getSelectionStats(): { total: number; selected: number } {
  const root = document.getElementById(ROOT_ID);
  if (!root) return { total: 0, selected: 0 };
  const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-uindex]'));
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
  const match = href.match(/\/c\/([a-zA-Z0-9_-]+)/);
  return match?.[1];
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

  return { subject, topic, chatTitle };
}

function buildExportFromTurns(turns: ExportTurn[], htmlBodies?: string[]): string {
  const { subject, topic, chatTitle } = getSubjectTopicAndChatTitle();

  const meta = {
    noteId: generateNoteId(),
    source: 'chatgpt',
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
    turnCount: turns.length,
    splitHints: [],

    author: 'me',
    visibility: 'private',
  } satisfies ExportNoteMetadata;

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

function scrollPromptIntoViewByIndex(tupleIndex: number) {
  const tuples = getMessageTuples();
  const t = tuples[tupleIndex];
  if (!t || t.role !== 'user') return;

  const el = t.el as HTMLElement;
  const scroller = findScrollContainer(el);

  const elRect = el.getBoundingClientRect();
  const scRect = scroller.getBoundingClientRect();

  const offset = getLocalHeaderOffset(scroller);
  const current = scroller.scrollTop;
  const targetY = current + (elRect.top - scRect.top) - offset;

  scroller.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
  highlightPrompt(el);
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
        root!.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-uindex]').forEach(cb => (cb.checked = true));
        updateControlsState();
      };

      const btnNone = d.createElement('button');
      btnNone.id = NONE_BTN_ID;
      btnNone.type = 'button';
      btnNone.textContent = 'None';
      btnNone.onclick = () => {
        root!.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-uindex]').forEach(cb => (cb.checked = false));
        updateControlsState();
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
          const md = buildExportFromTurns(turns, htmlBodies);
          downloadExport(`${filenameBase()}.md`, md);
        } catch (err) {
          console.error('[chatworthy] export failed:', err);
          alert('Export failed — see console for details.');
        }
      };

      controls.appendChild(toggleBtn);
      controls.appendChild(btnAll);
      controls.appendChild(btnNone);
      controls.appendChild(exportBtn);
      root.appendChild(controls);
    } else {
      const toggle = controls.querySelector('#' + TOGGLE_BTN_ID) as HTMLButtonElement | null;
      if (toggle) toggle.textContent = root.getAttribute('data-collapsed') === '1' ? 'Show List' : 'Hide List';
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

    // 4) Populate list from tuples
    list.innerHTML = '';

    listItemByTupleIndex = new Map();
    setSelectedListItem(null);

    const tuples = getMessageTuples();
    const userTuples: Array<{ idx: number; el: HTMLElement }> = [];
    tuples.forEach((t, idx) => {
      if (t.role === 'user') userTuples.push({ idx, el: t.el });
    });

    if (userTuples.length === 0) {
      const empty = d.createElement('div');
      empty.textContent = 'No prompts detected yet.';
      empty.style.opacity = '0.7';
      empty.style.fontSize = '12px';
      list.appendChild(empty);
    } else {
      for (const { idx, el: node } of userTuples) {
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
        cb.dataset.uindex = String(idx);
        cb.addEventListener('change', updateControlsState);
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('keydown', (e) => e.stopPropagation());

        const span = d.createElement('span');
        span.className = 'chatworthy-item-text';
        const clone = node.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.cw-role-label,[data-cw-hidden="1"]').forEach(n => n.remove());
        span.textContent = (clone.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        span.style.lineHeight = '1.2';

        listItemByTupleIndex.set(idx, item);

        item.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName.toLowerCase() === 'input') return;
          lastManualSelectAt = Date.now();
          setSelectedListItem(item);
          scrollPromptIntoViewByIndex(idx);
        });

        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            lastManualSelectAt = Date.now();
            setSelectedListItem(item);
            scrollPromptIntoViewByIndex(idx);
          }
        });

        item.appendChild(cb);
        item.appendChild(span);
        list.appendChild(item);
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
  if (!/^(chatgpt\.com|chat\.openai\.com)$/i.test(host)) {
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
