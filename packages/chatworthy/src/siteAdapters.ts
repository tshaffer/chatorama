// siteAdapters.ts — per-site DOM selectors for message extraction and title detection

export type SiteName = 'chatgpt' | 'gemini' | 'claude';

export function getSite(): SiteName {
  const host = location.hostname;
  if (host.includes('gemini.google.com')) return 'gemini';
  if (host.includes('claude.ai')) return 'claude';
  return 'chatgpt';
}

export interface MessageTuple {
  el: HTMLElement;
  role: 'user' | 'assistant';
}

// ---- ChatGPT -----------------------------------------------

function getMessageTuplesChatGPT(): MessageTuple[] {
  const chosen: MessageTuple[] = [];
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
      chosen.push({ el: root, role: 'assistant' });
    }
  }

  return chosen;
}

function getChatTitleChatGPT(): string {
  const sidebarSelected =
    document.querySelector('nav a[aria-current="page"]') ||
    document.querySelector('nav [data-selected="true"]') ||
    document.querySelector('nav a.bg-token-sidebar-surface-secondary') ||
    document.querySelector('nav a[aria-current="true"]');

  const headerTitleEl =
    document.querySelector('[data-testid="conversation-title"]') ||
    document.querySelector('header [data-testid="chat-title"]') ||
    document.querySelector('header [contenteditable="true"][role="textbox"]') ||
    document.querySelector('header h1');

  return (
    sidebarSelected?.textContent?.trim() ||
    headerTitleEl?.textContent?.trim() ||
    document.title.replace(/\s+[–—-]\s+ChatGPT.*$/i, '').trim() ||
    'ChatGPT Conversation'
  );
}

// ---- Gemini ------------------------------------------------

function getMessageTuplesGemini(): MessageTuple[] {
  const chosen: MessageTuple[] = [];
  const seen = new Set<HTMLElement>();

  // Primary: custom elements used by Gemini
  const userEls = Array.from(document.querySelectorAll<HTMLElement>(
    'user-query, [data-turn-role="user"], .user-query-container'
  ));
  const assistantEls = Array.from(document.querySelectorAll<HTMLElement>(
    'model-response, [data-turn-role="model"], .model-response-text'
  ));

  // Interleave in DOM order
  const all: Array<{ el: HTMLElement; role: 'user' | 'assistant' }> = [
    ...userEls.map(el => ({ el, role: 'user' as const })),
    ...assistantEls.map(el => ({ el, role: 'assistant' as const })),
  ].sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  for (const { el, role } of all) {
    if (seen.has(el)) continue;
    seen.add(el);
    chosen.push({ el, role });
  }

  // Fallback: conversation turns with role attributes
  if (chosen.length === 0) {
    const turns = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-conversation-role], .conversation-turn'
    ));
    for (const el of turns) {
      if (seen.has(el)) continue;
      seen.add(el);
      const roleAttr = (el.getAttribute('data-conversation-role') || '').toLowerCase();
      const role: 'user' | 'assistant' = roleAttr === 'user' ? 'user' : 'assistant';
      chosen.push({ el, role });
    }
  }

  return chosen;
}

function getChatTitleGemini(): string {
  // Sidebar selected conversation title
  const sidebarSelected =
    document.querySelector('.conversation-title--selected') ||
    document.querySelector('[data-selected="true"] .conversation-title') ||
    document.querySelector('nav [aria-selected="true"]') ||
    document.querySelector('.mat-list-item--activated .conversation-title') ||
    document.querySelector('[class*="selected"] [class*="title"]');

  if (sidebarSelected?.textContent?.trim()) {
    return sidebarSelected.textContent.trim();
  }

  // Header title
  const headerTitle =
    document.querySelector('h1[class*="title"]') ||
    document.querySelector('.chat-title') ||
    document.querySelector('header h1');

  if (headerTitle?.textContent?.trim()) {
    return headerTitle.textContent.trim();
  }

  return document.title.replace(/\s+[–—-]\s+Gemini.*$/i, '').trim() || 'Gemini Conversation';
}

// ---- Claude ------------------------------------------------

function getMessageTuplesClaude(): MessageTuple[] {
  const chosen: MessageTuple[] = [];
  const seen = new Set<HTMLElement>();

  // Primary: testid attributes
  const turns = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-testid="human-turn"], [data-testid="ai-turn"]'
  ));

  for (const el of turns) {
    if (seen.has(el)) continue;
    seen.add(el);
    const testId = el.getAttribute('data-testid') || '';
    const role: 'user' | 'assistant' = testId === 'human-turn' ? 'user' : 'assistant';
    chosen.push({ el, role });
  }

  // Fallback: class-based detection
  if (chosen.length === 0) {
    const humanTurns = Array.from(document.querySelectorAll<HTMLElement>(
      '[class*="human"], [class*="Human"], [class*="user-message"]'
    ));
    const aiTurns = Array.from(document.querySelectorAll<HTMLElement>(
      '[class*="assistant"], [class*="Assistant"], [class*="ai-message"]'
    ));

    const all = [
      ...humanTurns.map(el => ({ el, role: 'user' as const })),
      ...aiTurns.map(el => ({ el, role: 'assistant' as const })),
    ].sort((a, b) => {
      const pos = a.el.compareDocumentPosition(b.el);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    for (const { el, role } of all) {
      if (seen.has(el)) continue;
      seen.add(el);
      chosen.push({ el, role });
    }
  }

  return chosen;
}

function getChatTitleClaude(): string {
  // Sidebar: selected conversation
  const sidebarSelected =
    document.querySelector('nav a[aria-current="page"]') ||
    document.querySelector('[data-selected="true"]') ||
    document.querySelector('[aria-current="true"]') ||
    document.querySelector('[class*="selected"] [class*="title"]');

  if (sidebarSelected?.textContent?.trim()) {
    return sidebarSelected.textContent.trim();
  }

  // Header
  const headerTitle =
    document.querySelector('h1') ||
    document.querySelector('[data-testid="conversation-title"]') ||
    document.querySelector('header [contenteditable]');

  if (headerTitle?.textContent?.trim()) {
    return headerTitle.textContent.trim();
  }

  return document.title.replace(/\s+[–—-]\s+Claude.*$/i, '').trim() || 'Claude Conversation';
}

// ---- Public API --------------------------------------------

export function getMessageTuples(): MessageTuple[] {
  const site = getSite();
  if (site === 'gemini') return getMessageTuplesGemini();
  if (site === 'claude') return getMessageTuplesClaude();
  return getMessageTuplesChatGPT();
}

export function getChatTitle(): string {
  const site = getSite();
  if (site === 'gemini') return getChatTitleGemini();
  if (site === 'claude') return getChatTitleClaude();
  return getChatTitleChatGPT();
}
