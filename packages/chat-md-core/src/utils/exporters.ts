import type { ExportNoteMetadata, ExportTurn } from '../types';

// If you bundle with esbuild/webpack, install these deps:
//   npm i turndown turndown-plugin-gfm
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// ---------------- Shared helpers ----------------

function roleLabel(role: ExportTurn['role']): 'Prompt' | 'Response' | 'System' | 'Tool' {
  if (role === 'user') return 'Prompt';
  if (role === 'assistant') return 'Response';
  if (role === 'system') return 'System';
  return 'Tool';
}

function renderFrontMatter(meta: ExportNoteMetadata): string {
  const kv: Record<string, any> = {
    noteId: meta.noteId,
    source: meta.source,
    chatId: meta.chatId,
    chatTitle: meta.chatTitle,
    pageUrl: meta.pageUrl,
    exportedAt: meta.exportedAt,
    model: meta.model,
    subject: (meta as any).subject,
    topic: (meta as any).topic,
    summary: (meta as any).summary,
    tags: (meta as any).tags,
  };
  const lines = ['---'];
  for (const [k, v] of Object.entries(kv)) {
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${k}: ${Array.isArray(v) ? JSON.stringify(v) : String(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function firstLineTitle(s: string | undefined, fallback: string) {
  const line = (s || '')
    .split('\n')
    .find(l => l.trim().length > 0)?.trim() ?? fallback;
  return line.length > 220 ? line.slice(0, 217) + '…' : line;
}

function buildToc(prompts: { idx: number; title: string; anchor: string }[]): string[] {
  if (!prompts.length) return [];
  const out: string[] = [];
  out.push('## Table of Contents', ''); // blank line for proper MD rendering

  for (const p of prompts) {
    const safeTitle = p.title.replace(/\n+/g, ' ').trim();
    // Ordered-list item (no bullets): "1. [Title](#anchor)"
    out.push(`${p.idx}. [${safeTitle}](#${p.anchor})`);
  }

  out.push('');
  return out;
}

// --- Rendering helpers (Prompt/Response formatting) -----------------

function renderPromptBlockquote(md: string): string {
  // Render the Prompt label, then quote the entire prompt so it inherits body text styles
  const text = (md || '').trimEnd();
  const quoted = text
    .split('\n')
    .map((l) => (l.length ? `> ${l}` : '>'))
    .join('\n');
  return `**Prompt**\n\n${quoted}`;
}

function renderPromptBlockquoteWithAnchor(md: string, anchorId: string): string {
  const anchor = `<a id="${anchorId}"></a>`;
  return `${anchor}\n${renderPromptBlockquote(md)}`;
}

function normalizeSuggestionsSection(md: string): string {
  // 1) Remove HRs which VS Code renders with big margins
  let out = md.replace(/\n-{3,}\n+/g, '\n\n');

  // 2) Normalize common “Suggestions” headings to a consistent H4
  out = out.replace(/\n(?:\*\*)?\s*suggestions\s*:?(?:\*\*)?\s*\n/gi, '\n\n#### Suggestions\n');

  // 3) Convert trailing lines that look like chips into bullets (very light-touch)
  // e.g., lines starting with •, ◦, → become "- "
  out = out.replace(/^[ \t]*[•◦→]\s+/gm, '- ');

  return out;
}

function renderResponseSection(md: string): string {
  const body = (md || '').trimEnd();
  return `**Response**\n\n${normalizeSuggestionsSection(body)}`;
}

// ---------------- Turndown (HTML → Markdown) ----------------

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  fence: '```',
  strongDelimiter: '**'
});
td.use(gfm);

// Preserve fenced code blocks with language
td.addRule('fencedCodeWithLang', {
  filter: (node: any) =>
    node.nodeName === 'PRE' &&
    (node as HTMLElement).firstElementChild?.nodeName === 'CODE',
  replacement: (_content: string, node: any) => {
    const codeEl = (node as HTMLElement).querySelector('code')!;
    const cls = codeEl.getAttribute('class') || '';
    const match = cls.match(/language-([\w+#-]+)/i);
    const lang = match ? match[1] : '';
    const code = codeEl.textContent || '';
    return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
  }
});

// Inline code (avoid wrapping PRE > CODE)
td.addRule('inlineCode', {
  filter: (node: any) =>
    node.nodeName === 'CODE' &&
    node.parentElement?.nodeName !== 'PRE',
  replacement: (content: string) => '`' + content + '`'
});

// KaTeX math → Markdown math
td.addRule('katexMath', {
  filter: (node: any) => {
    if ((node as any).nodeType !== 1) return false;
    const el = node as Element;
    return el.classList.contains('katex') || el.classList.contains('katex-display');
  },
  replacement: (_content: string, node: any) => {
    const el = node as Element;
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    const tex = ann?.textContent || '';
    const isBlock = el.classList.contains('katex-display');
    return isBlock ? `\n$$\n${tex}\n$$\n` : `$${tex}$`;
  }
});

// Images
td.addRule('images', {
  filter: 'img',
  replacement: (_content: string, node: any) => {
    const img = node as HTMLImageElement;
    const alt = img.alt?.trim() || 'image';
    const src = img.src || '';
    if (!src) return `![${alt}]`;
    return `![${alt}](${src})`;
  }
});

// Tighter blockquotes (avoid extra blank lines)
td.addRule('blockquoteTight', {
  filter: 'blockquote',
  replacement: (content: string) =>
    '\n' + content.split('\n').map((l: string) => (l ? '> ' + l : '>')).join('\n') + '\n'
});

// Cleanup
function tidyMarkdown(md: string) {
  return md
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '');
}

function htmlToMarkdown(html: string): string {
  // Work on a detached element so we can strip UI chrome if we want
  const container = document.createElement('div');
  container.innerHTML = html;

  // Strip common chrome
  container.querySelectorAll('button,svg,nav,[data-testid="toolbar"]').forEach(n => n.remove());

  const md = td.turndown(container.innerHTML);
  return tidyMarkdown(md);
}

// ---------------- Pure Markdown (uses HTML bodies) ----------------

function toPureMarkdownChatStyleFromHtml(
  meta: ExportNoteMetadata,
  turns: ExportTurn[],
  htmlBodies: string[], // 1:1 with turns
  opts?: {
    title?: string;
    includeFrontMatter?: boolean;
    includeMetaRow?: boolean;
    hrBetween?: boolean;
    freeformNotes?: string;
    includeToc?: boolean; // NEW: default true
  }
): string {
  const {
    title = meta.chatTitle || 'Chat Export',
    includeFrontMatter = true,
    includeMetaRow = true,
    hrBetween = false, // ← default OFF (no ---)
    freeformNotes,
    includeToc = true,
  } = opts || {};

  const out: string[] = [];
  if (includeFrontMatter) out.push(renderFrontMatter(meta));

  out.push(`# ${title}`, '');

  if (includeMetaRow) {
    if (meta.pageUrl) out.push(`Source: ${meta.pageUrl}`);
    if (meta.exportedAt) out.push(`Exported: ${meta.exportedAt}`);
    out.push('');
  }

  // Precompute prompt titles/anchors for ToC
  const promptInfos: { idx: number; title: string; anchor: string; turnIndex: number }[] = [];
  let promptCounter = 0;
  turns.forEach((t, i) => {
    if (t.role === 'user') {
      promptCounter += 1;
      const md = htmlToMarkdown(htmlBodies[i] || '');
      const titleText = firstLineTitle(md, `Prompt ${promptCounter}`);
      promptInfos.push({
        idx: promptCounter,
        title: titleText,
        anchor: `p-${promptCounter}`,
        turnIndex: i,
      });
    }
  });

  if (includeToc) {
    out.push(...buildToc(promptInfos.map(p => ({ idx: p.idx, title: p.title, anchor: p.anchor }))));
  }

  const sep = hrBetween ? '\n\n' : '\n\n'; // keep double newlines either way

  let currentPromptNumber = 0;
  const blocks = turns.map((t, i) => {
    const bodyMd = htmlToMarkdown(htmlBodies[i] || '').replace(/\r\n/g, '\n').trimEnd();
    if (t.role === 'user') {
      currentPromptNumber += 1;
      const anchorId = `p-${currentPromptNumber}`;
      return renderPromptBlockquoteWithAnchor(bodyMd, anchorId);
    }
    if (t.role === 'assistant') {
      return renderResponseSection(bodyMd);
    }
    // system / tool (rare) — keep simple but styled
    const label = t.role === 'system' ? 'System' : 'Tool';
    return `**${label}**\n\n${bodyMd}`;
  });

  out.push(blocks.join(sep));

  if (freeformNotes && freeformNotes.trim()) {
    out.push('', '## Notes', '', freeformNotes.trim(), '');
  }

  if (out[out.length - 1] !== '') out.push('');
  return out.join('\n');
}

// ---------------- Format-aware builder ----------------

/**
 * Chooses between:
 * - 'markdown_pure'  => ChatGPT Exporter–style Markdown using per-turn HTML bodies (now with ToC + anchors)
 * - 'markdown_html'  => your existing YAML + transcript block (legacy)
 */
export function buildMarkdownExport(
  meta: ExportNoteMetadata,
  turns: ExportTurn[],
  opts?: {
    title?: string;
    freeformNotes?: string;
    includeFrontMatter?: boolean;
    includeMetaRow?: boolean;
    htmlBodies?: string[]; // required for Pure MD
    includeToc?: boolean;  // NEW: default true for Pure MD
  }
): string {
  const metaWithTitle: ExportNoteMetadata = opts?.title
    ? { ...meta, chatTitle: opts.title }
    : meta;


  const htmlBodies = opts?.htmlBodies ?? [];
  const includeToc = opts?.includeToc ?? true;

  // Fallback: if not provided, degrade to text-only, but still add ToC + anchors
  if (!htmlBodies.length || htmlBodies.length !== turns.length) {
    const head = (opts?.includeFrontMatter ?? true) ? renderFrontMatter(metaWithTitle) : '';
    const title = metaWithTitle.chatTitle || 'Chat Export';
    const metaLines = [
      head,
      `# ${title}`,
      '',
      metaWithTitle.pageUrl ? `Source: ${metaWithTitle.pageUrl}` : '',
      metaWithTitle.exportedAt ? `Exported: ${metaWithTitle.exportedAt}` : '',
      ''
    ].filter(Boolean).join('\n');

    // Build prompt list for ToC from plain text
    const prompts: { idx: number; title: string; anchor: string }[] = [];
    let pc = 0;
    for (const t of turns) {
      if (t.role === 'user') {
        pc += 1;
        prompts.push({
          idx: pc,
          title: firstLineTitle(t.text, `Prompt ${pc}`),
          anchor: `p-${pc}`,
        });
      }
    }

    const toc = includeToc ? buildToc(prompts) : [];

    // Render body with anchors
    let currentPrompt = 0;
    const blocks = turns.map((t) => {
      const body = (t.text || '').replace(/\r\n/g, '\n').trimEnd();
      if (t.role === 'user') {
        currentPrompt += 1;
        return renderPromptBlockquoteWithAnchor(body, `p-${currentPrompt}`);
      }
      if (t.role === 'assistant') return renderResponseSection(body);
      const label = roleLabel(t.role);
      return `**${label}**\n\n${body}`;
    });

    const body = blocks.join('\n\n');
    const notes = opts?.freeformNotes?.trim() ? `\n\n## Notes\n\n${opts.freeformNotes.trim()}\n` : '';
    return `${metaLines}${toc.join('\n')}${body}${notes}${body.endsWith('\n') ? '' : '\n'}`;
  }

  return toPureMarkdownChatStyleFromHtml(
    metaWithTitle,
    turns,
    htmlBodies,
    {
      title: metaWithTitle.chatTitle,
      includeFrontMatter: opts?.includeFrontMatter ?? true,
      includeMetaRow: opts?.includeMetaRow ?? true,
      hrBetween: true,
      freeformNotes: opts?.freeformNotes,
      includeToc,
    }
  );

}
