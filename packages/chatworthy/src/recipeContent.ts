// packages/chatworthy/src/recipeContent.ts
// NYT Cooking recipe capture (Schema.org Recipe JSON-LD)

const API_BASE = 'http://localhost:8080/api/v1';
const ROOT_ID = 'chatworthy-recipe-root';
const BTN_ID = 'chatworthy-recipe-capture-btn';
const STATUS_ID = 'chatworthy-recipe-status';

type RecipeCapturePayload = {
  pageUrl: string;
  recipeJsonLd: unknown;
};

function isTopWindow() {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [x];
}

function isRecipeNode(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  const t = (node['@type'] ?? node['type']) as any;
  if (!t) return false;

  if (typeof t === 'string') return t.toLowerCase() === 'recipe';
  if (Array.isArray(t)) return t.some((v) => typeof v === 'string' && v.toLowerCase() === 'recipe');

  return false;
}

/**
 * Scan all ld+json blocks. NYT typically has a single JSON object with @type Recipe,
 * but we handle arrays and @graph as well.
 */
function findRecipeJsonLd(): { recipe: unknown; raw: string } | null {
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
  );

  for (const s of scripts) {
    const raw = (s.textContent || '').trim();
    if (!raw) continue;

    const parsed = safeJsonParse(raw);
    if (!parsed) continue;

    // Common shapes:
    // 1) { @type: "Recipe", ... }
    // 2) [ { ... }, { @type:"Recipe" ... } ]
    // 3) { @graph: [ ... { @type:"Recipe" } ... ] }
    // 4) { ... mainEntity: { @type:"Recipe" } } (less common)

    const candidates: unknown[] = [];

    const pushCandidate = (x: unknown) => {
      if (!x) return;
      candidates.push(x);
    };

    if (Array.isArray(parsed)) {
      for (const item of parsed) pushCandidate(item);
    } else if (typeof parsed === 'object' && parsed) {
      const obj: any = parsed;
      pushCandidate(obj);
      if (obj['@graph']) {
        for (const g of asArray(obj['@graph'])) pushCandidate(g);
      }
      if (obj['mainEntity']) pushCandidate(obj['mainEntity']);
    }

    // Expand one level if any candidate is an array
    const flattened: unknown[] = [];
    for (const c of candidates) {
      if (Array.isArray(c)) flattened.push(...c);
      else flattened.push(c);
    }

    for (const node of flattened) {
      if (isRecipeNode(node)) {
        return { recipe: node, raw };
      }
    }
  }

  return null;
}

function setStatus(msg: string, isError = false) {
  const el = document.getElementById(STATUS_ID);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#b91c1c' : '#111';
}

async function tryPostToBackend(payload: RecipeCapturePayload): Promise<Response> {
  // Endpoint can be implemented later; this is best-effort.
  // Choose a reasonable placeholder path:
  const url = `${API_BASE}/recipes/import`;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

function ensureUi() {
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.position = 'fixed';
  root.style.zIndex = '2147483647';
  root.style.right = '16px';
  root.style.top = '16px';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '6px';
  root.style.padding = '8px';
  root.style.borderRadius = '10px';
  root.style.border = '1px solid rgba(0,0,0,0.15)';
  root.style.background = 'rgba(255,255,255,0.95)';
  root.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)';
  root.style.fontSize = '12px';
  root.style.maxWidth = '260px';

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = 'Capture Recipe';
  btn.style.fontSize = '12px';
  btn.style.padding = '6px 10px';
  btn.style.borderRadius = '8px';
  btn.style.border = '1px solid rgba(0,0,0,0.2)';
  btn.style.background = 'white';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = '700';

  const status = document.createElement('div');
  status.id = STATUS_ID;
  status.textContent = 'Ready';
  status.style.opacity = '0.9';

  btn.onclick = async () => {
    btn.disabled = true;
    setStatus('Scanning...');

    try {
      const found = findRecipeJsonLd();
      if (!found) {
        setStatus('No Recipe JSON-LD found on this page.', true);
        return;
      }

      const payload: RecipeCapturePayload = {
        pageUrl: location.href,
        recipeJsonLd: found.recipe,
      };

      setStatus('Posting...');
      const res = await tryPostToBackend(payload);
      if (res.ok) {
        setStatus('Imported ✅');
      } else if (res.status === 409) {
        setStatus('Already imported (duplicate)');
      } else {
        setStatus(`Import failed: ${res.status}`, true);
      }
    } catch (err: any) {
      console.error('[chatworthy][recipe] capture failed:', err);
      setStatus(err?.message || 'Capture failed', true);
    } finally {
      btn.disabled = false;
    }
  };

  root.appendChild(btn);
  root.appendChild(status);
  (document.body || document.documentElement).appendChild(root);
}

async function init() {
  if (!isTopWindow()) return;

  const host = (location.host || '').toLowerCase();
  const path = location.pathname || '';

  const isNytCooking = host === 'cooking.nytimes.com';
  const isBonAppetit = host === 'www.bonappetit.com' || host === 'bonappetit.com';

  const isLikelyRecipePath =
    (isNytCooking && /^\/recipes\//i.test(path)) ||
    (isBonAppetit && /^\/recipe\//i.test(path));

  if (!isLikelyRecipePath) return;

  if (document.readyState === 'loading') {
    await new Promise<void>((resolve) =>
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
    );
  }

  console.log('[chatworthy][recipe] content script active', { host, path });
  ensureUi();
}

void init();
