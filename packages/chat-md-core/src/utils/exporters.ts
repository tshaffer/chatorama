// packages/chat-md-core/src/utils/exporters.ts
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { ExportNoteMetadata, ExportTurn } from '../types';

/* -------------------------------------------------------------
 * Utility: Determine role label (Prompt / Response / System)
 * ------------------------------------------------------------- */
function roleLabel(role: ExportTurn['role']): 'Prompt' | 'Response' | 'System' | 'Tool' {
  if (role === 'user') return 'Prompt';
  if (role === 'assistant') return 'Response';
  if (role === 'system') return 'System';
  return 'Tool';
}

/* -------------------------------------------------------------
 * YAML Front Matter Renderer
 * ------------------------------------------------------------- */
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

/* -------------------------------------------------------------
 * Helper: First non-empty line as title
 * ------------------------------------------------------------- */
function firstLineTitle(s: string | undefined, fallback: string) {
  const line =
    (s || '')
      .split('\n')
      .find((l) => l.trim().length > 0)
      ?.trim() ?? fallback;
  return line.length > 220 ? line.slice(0, 217) + '…' : line;
}

/* -------------------------------------------------------------
 * Table of Contents builder
 * ------------------------------------------------------------- */
function buildToc(prompts: { idx: number; title: string; anchor: string }[]): string[] {
  if (!prompts.length) return [];
  const out: string[] = [];
  out.push('## Table of Contents', '');

  for (const p of prompts) {
    const safeTitle = p.title.replace(/\n+/g, ' ').trim();
    out.push(`${p.idx}. [${safeTitle}](#${p.anchor})`);
  }

  out.push('');
  return out;
}

/* -------------------------------------------------------------
 * Chatalog metadata (hidden HTML comment)
 * ------------------------------------------------------------- */
type ChatalogMetaV1 = {
  schemaVersion: 1;
  noteId: string;
  chatId?: string;
  chatTitle?: string;
  pageUrl?: string;
  exportedAt?: string;
  source?: string;
  model?: string;
  subjectHint?: string;
  topicHint?: string;
};

function renderChatalogMetaComment(meta: ExportNoteMetadata): string {
  const chatalogMeta: ChatalogMetaV1 = {
    schemaVersion: 1,
    noteId: meta.noteId,
    chatId: meta.chatId,
    chatTitle: meta.chatTitle,
    pageUrl: meta.pageUrl,
    exportedAt: meta.exportedAt,
    source: meta.source,
    model: meta.model,
    subjectHint: meta.subject,
    topicHint: meta.topic,
  };

  const json = JSON.stringify(chatalogMeta);
  return `<!-- chatalog-meta ${json} -->`;
}

/* -------------------------------------------------------------
 * Prompt / Response Markdown Renderers
 * ------------------------------------------------------------- */
function renderPromptBlockquote(md: string): string {
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
  let out = md.replace(/\n-{3,}\n+/g, '\n\n');
  out = out.replace(/\n(?:\*\*)?\s*suggestions\s*:?(?:\*\*)?\s*\n/gi, '\n\n#### Suggestions\n');
  out = out.replace(/^[ \t]*[•◦→]\s+/gm, '- ');
  return out;
}

/**
 * Some renderers you care about (Chrome + Chatalog) correctly format code only when it uses
 * your “double-fence” structure:
 *
 *   ```
 *   ``js
 *   code...
 *   ``
 *   ```
 *
 * Turndown often emits:
 *
 *   js
 *
 *   `code...`
 *
 * And inside lists it may indent the fence marker lines. This fixer:
 * - converts the lang+inline-code pattern to the double-fence structure
 * - removes indentation on fence marker lines so you get:
 *     ```        (column 0)
 *     ``json     (column 0)
 *     ``         (column 0)
 */
function fixChatalogDoubleFences(md: string): string {
  let out = md;

  // (A) Unindent fence marker lines anywhere (outer ``` lines, inner ``lang lines, inner `` lines).
  // Only touches lines that are *just* markers (optionally with trailing spaces).
  out = out
    .replace(/^[ \t]+(```)[ \t]*$/gm, '$1')
    .replace(/^[ \t]+(``[A-Za-z][\w+-]{0,30})[ \t]*$/gm, '$1')
    .replace(/^[ \t]+(``)[ \t]*$/gm, '$1');

  // (B) Convert:
  //   <lang>\n
  //   \n
  //   `<code>`\n
  // into:
  //   ```\n
  //   ``<lang>\n
  //   <code>\n
  //   ``\n
  //   ```
  //
  // IMPORTANT: We should not run this conversion inside an existing triple-backtick fenced block,
  // to avoid accidental changes in code examples.
  const parts: string[] = [];
  const fenceRe = /```[\s\S]*?```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  const convertInText = (text: string) =>
    text.replace(
      /(^|\n)[ \t]*([A-Za-z][\w+-]{0,30})[ \t]*\n(?:[ \t]*\n)+[ \t]*`([\s\S]*?)`[ \t]*(?=\n|$)/g,
      (_match: string, prefix: string, lang: string, code: string) => {
        const body = String(code).replace(/^\n+|\n+$/g, '');
        return `${prefix}\`\`\`\n\`\`${lang}\n${body}\n\`\`\n\`\`\``;
      }
    );

  while ((m = fenceRe.exec(out)) !== null) {
    parts.push(convertInText(out.slice(last, m.index)));
    parts.push(m[0]); // keep existing fenced blocks intact
    last = m.index + m[0].length;
  }
  parts.push(convertInText(out.slice(last)));
  out = parts.join('');

  // (C) Unindent again (conversion may have preserved some list indentation around the marker lines)
  out = out
    .replace(/^[ \t]+(```)[ \t]*$/gm, '$1')
    .replace(/^[ \t]+(``[A-Za-z][\w+-]{0,30})[ \t]*$/gm, '$1')
    .replace(/^[ \t]+(``)[ \t]*$/gm, '$1');

  return out;
}

function renderResponseSection(md: string): string {
  const body = (md || '').trimEnd();
  const fixed = fixChatalogDoubleFences(body);
  return `**Response**\n\n${normalizeSuggestionsSection(fixed)}`;
}

/* -------------------------------------------------------------
 * Turndown instance (HTML → Markdown)
 * ------------------------------------------------------------- */
const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  fence: '```',
  strongDelimiter: '**',
});
td.use(gfm);

/* -------------------------------------------------------------
 * ⭐ Preserve <br> as real newline
 * ------------------------------------------------------------- */
td.addRule('preserveBreaks', {
  filter: 'br',
  replacement: () => '\n',
});

/* -------------------------------------------------------------
 * Additional Turndown rules
 * ------------------------------------------------------------- */
td.addRule('fencedCodeWithLang', {
  filter: (node: any) =>
    node.nodeName === 'PRE' && (node as HTMLElement).firstElementChild?.nodeName === 'CODE',
  replacement: (_content: string, node: any) => {
    const codeEl = (node as HTMLElement).querySelector('code')!;
    const cls = codeEl.getAttribute('class') || '';
    const match = cls.match(/language-([\w+#-]+)/i);
    const lang = match ? match[1] : '';
    const code = codeEl.textContent || '';
    return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
  },
});

td.addRule('inlineCode', {
  filter: (node: any) => node.nodeName === 'CODE' && node.parentElement?.nodeName !== 'PRE',
  replacement: (content: string) => '`' + content + '`',
});

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
  },
});

td.addRule('images', {
  filter: 'img',
  replacement: (_content: string, node: any) => {
    const img = node as HTMLImageElement;
    const alt = img.alt?.trim() || 'image';
    const src = img.src || '';
    if (!src) return `![${alt}]`;
    return `![${alt}](${src})`;
  },
});

td.addRule('blockquoteTight', {
  filter: 'blockquote',
  replacement: (content: string) =>
    '\n' +
    content
      .split('\n')
      .map((l: string) => (l ? '> ' + l : '>'))
      .join('\n') +
    '\n',
});

function tidyMarkdown(md: string) {
  return md.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '');
}

function htmlToMarkdown(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('button,svg,nav,[data-testid="toolbar"]').forEach((n) => n.remove());
  const md = td.turndown(container.innerHTML);
  return tidyMarkdown(md);
}

/* -------------------------------------------------------------
 * Pure Markdown builder using HTML bodies
 * ------------------------------------------------------------- */
function toPureMarkdownChatStyleFromHtml(
  meta: ExportNoteMetadata,
  turns: ExportTurn[],
  htmlBodies: string[],
  opts?: {
    title?: string;
    includeFrontMatter?: boolean;
    includeMetaRow?: boolean;
    hrBetween?: boolean;
    freeformNotes?: string;
    includeToc?: boolean;
  }
): string {
  const {
    title = meta.chatTitle || 'Chat Export',
    includeFrontMatter = true,
    includeMetaRow = true,
    hrBetween = false,
    freeformNotes,
    includeToc = true,
  } = opts || {};

  const out: string[] = [];

  if (includeFrontMatter) {
    out.push(renderFrontMatter(meta));
    out.push(renderChatalogMetaComment(meta), '');
  }

  out.push(`# ${title}`, '');

  if (includeMetaRow) {
    if (meta.pageUrl) out.push(`Source: ${meta.pageUrl}`);
    if (meta.exportedAt) out.push(`Exported: ${meta.exportedAt}`);
    out.push('');
  }

  const promptInfos: { idx: number; title: string; anchor: string; turnIndex: number }[] = [];
  let promptCounter = 0;

  turns.forEach((t, i) => {
    if (t.role === 'user') {
      promptCounter += 1;
      const sourceText = (t.text ?? '').replace(/\r\n/g, '\n');
      const titleText = firstLineTitle(sourceText, `Prompt ${promptCounter}`);

      promptInfos.push({
        idx: promptCounter,
        title: titleText,
        anchor: `p-${promptCounter}`,
        turnIndex: i,
      });
    }
  });

  if (includeToc) {
    out.push(...buildToc(promptInfos.map((p) => ({ idx: p.idx, title: p.title, anchor: p.anchor }))));
  }

  const sep = '\n\n';
  let currentPromptNumber = 0;

  const blocks = turns.map((t, i) => {
    if (t.role === 'user') {
      currentPromptNumber += 1;
      const anchorId = `p-${currentPromptNumber}`;

      // For prompts, preserve raw text line structure.
      const bodyText = (t.text ?? '').replace(/\r\n/g, '\n').trimEnd();
      return renderPromptBlockquoteWithAnchor(bodyText, anchorId);
    }

    // For non-user turns, go HTML → Markdown.
    const bodyMd = htmlToMarkdown(htmlBodies[i] || '').replace(/\r\n/g, '\n').trimEnd();

    if (t.role === 'assistant') return renderResponseSection(bodyMd);

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

/* -------------------------------------------------------------
 * Main builder (automatic fallback)
 * ------------------------------------------------------------- */
export function buildMarkdownExport(
  meta: ExportNoteMetadata,
  turns: ExportTurn[],
  opts?: {
    title?: string;
    freeformNotes?: string;
    includeFrontMatter?: boolean;
    includeMetaRow?: boolean;
    htmlBodies?: string[];
    includeToc?: boolean;
  }
): string {
  const metaWithTitle: ExportNoteMetadata = opts?.title ? { ...meta, chatTitle: opts.title } : meta;

  const htmlBodies = opts?.htmlBodies ?? [];
  const includeToc = opts?.includeToc ?? true;

  // Fallback path when we don't have HTML bodies aligned with turns.
  if (!htmlBodies.length || htmlBodies.length !== turns.length) {
    const includeFrontMatter = opts?.includeFrontMatter ?? true;

    const prefixLines: string[] = [];
    if (includeFrontMatter) {
      prefixLines.push(renderFrontMatter(metaWithTitle));
      prefixLines.push(renderChatalogMetaComment(metaWithTitle), '');
    }

    const title = metaWithTitle.chatTitle || 'Chat Export';
    const metaLines = [
      ...prefixLines,
      `# ${title}`,
      '',
      metaWithTitle.pageUrl ? `Source: ${metaWithTitle.pageUrl}` : '',
      metaWithTitle.exportedAt ? `Exported: ${metaWithTitle.exportedAt}` : '',
      '',
    ]
      .filter(Boolean)
      .join('\n');

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
    const notes = opts?.freeformNotes?.trim()
      ? `\n\n## Notes\n\n${opts.freeformNotes.trim()}\n`
      : '';
    return `${metaLines}${toc.join('\n')}${body}${notes}${body.endsWith('\n') ? '' : '\n'}`;
  }

  return toPureMarkdownChatStyleFromHtml(metaWithTitle, turns, htmlBodies, {
    title: metaWithTitle.chatTitle,
    includeFrontMatter: opts?.includeFrontMatter ?? true,
    includeMetaRow: opts?.includeMetaRow ?? true,
    hrBetween: true,
    freeformNotes: opts?.freeformNotes,
    includeToc,
  });
}
