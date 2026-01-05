// frontend/src/components/MarkdownBody.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { extractPromptResponseTurns } from '@chatorama/chatalog-shared';

type Props = {
  markdown: string;
  className?: string;
  sx?: any;
  enableToc?: boolean; // defaults to true

  // NEW: allow clickable images that trigger a resize UI in parent
  enableImageSizingUi?: boolean; // default false
  onRequestResizeImage?: (args: { src?: string; title?: string; alt?: string }) => void;
  recipeTokens?: {
    ingredients?: React.ReactNode;
    steps?: React.ReactNode;
  };
};

type LogicalTurn = {
  prompt: string;
  response: string;
  turnIndex: number;
};

type PromptTocItem = {
  turnIndex: number;
  anchorId: string; // e.g. "turn-0"
  label: string;    // derived from prompt
};

const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];

const isSafeHref = (href?: string) => {
  if (!href) return false;
  if (href.startsWith('/') || href.startsWith('#')) return true;
  try {
    const url = new URL(href);
    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
};

function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

type ImageSizeSpec = { width?: string; height?: string };

function parseImageSize(title?: string): ImageSizeSpec {
  const t = (title ?? '').trim();
  if (!t) return {};
  const tokens = t.split(/\s+/);

  const out: ImageSizeSpec = {};
  for (const tok of tokens) {
    const m = tok.match(/^([a-zA-Z]+)=(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2];

    if (key === 'w') {
      if (val === 'full') out.width = '100%';
      else if (val === 'sm') out.width = '320px';
      else if (val === 'md') out.width = '520px';
      else if (val === 'lg') out.width = '760px';
      else if (/^\d+$/.test(val)) out.width = `${val}px`;
      else if (/^\d+px$/.test(val) || /^\d+%$/.test(val)) out.width = val;
    }

    if (key === 'h') {
      if (/^\d+$/.test(val)) out.height = `${val}px`;
      else if (/^\d+px$/.test(val)) out.height = val;
      else if (val === 'auto') out.height = 'auto';
    }
  }
  return out;
}

function promptToLabel(prompt: string, fallback: string) {
  const firstLine =
    (prompt ?? '')
      .split('\n')
      .map((s) => s.trim())
      .find(Boolean) ?? '';

  const base = firstLine || fallback;

  // Keep compact like Chatworthy
  return base.length > 80 ? `${base.slice(0, 77)}…` : base;
}

function findById(root: HTMLElement, id: string): HTMLElement | null {
  // Attribute selectors avoid the "#id starting with digit" selector issue.
  const escaped = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return root.querySelector(`[id="${escaped}"]`) as HTMLElement | null;
}

export default function MarkdownBody({
  markdown,
  className,
  sx,
  enableToc = true,
  enableImageSizingUi = false,
  onRequestResizeImage,
  recipeTokens,
}: Props) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [tocOpen, setTocOpen] = useState(true);

  // Build prompt turns (Chatworthy semantics)
  const turns = useMemo(() => extractPromptResponseTurns(markdown), [markdown]);

  // Only show Prompt-based TOC when markers exist
  const hasPromptMarkers = useMemo(() => /\*\*Prompt\*\*/i.test(markdown), [markdown]);

  const promptTocItems: PromptTocItem[] = useMemo(() => {
    if (!enableToc || !hasPromptMarkers) return [];
    return turns.map((t) => ({
      turnIndex: t.turnIndex,
      anchorId: `turn-${t.turnIndex}`,
      label: promptToLabel(t.prompt, `Prompt ${t.turnIndex + 1}`),
    }));
  }, [enableToc, hasPromptMarkers, turns]);

  // Counter used while ReactMarkdown renders: each "**Prompt**" gets the next anchor id.
  const renderPromptIndexRef = useRef(0);
  useEffect(() => {
    renderPromptIndexRef.current = 0;
  }, [markdown]);

  const jumpToId = (id: string) => {
    const root = contentRef.current;
    if (!root) return;

    const el = findById(root, id);
    if (!el) {
      // eslint-disable-next-line no-console
      console.warn('[TOC] target not found', { id });
      return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });

    el.classList.add('toc-target-flash');
    window.setTimeout(() => el.classList.remove('toc-target-flash'), 650);
  };

  const ING_TOKEN = '{{RECIPE_INGREDIENTS}}';
  const STEPS_TOKEN = '{{RECIPE_STEPS}}';

  const markdownComponents = {
    // Inject an anchor at each rendered "**Prompt**" marker
    strong: ({ children, ...rest }: any) => {
      const first = React.Children.toArray(children)[0];
      const text = typeof first === 'string' ? first : '';

      if (text.toLowerCase() === 'prompt') {
        const idx = renderPromptIndexRef.current++;
        const anchorId = `turn-${idx}`;
        return (
          <>
            <span id={anchorId} />
            <strong {...rest}>{children}</strong>
          </>
        );
      }

      return <strong {...rest}>{children}</strong>;
    },

    a: ({ href, children, ...rest }: any) => {
      if (!isSafeHref(href)) {
        return <span {...rest}>{children}</span>;
      }

      // Internal anchor: scroll inside the note; do not open new tab
      if (href?.startsWith('#')) {
        const id = href.slice(1);
        return (
          <a
            {...rest}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              jumpToId(id);
            }}
          >
            {children}
          </a>
        );
      }

      // External link: open new tab
      return (
        <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },

    img: ({ src, alt, title }: any) => {
      const spec = parseImageSize(title);
      const clickable = !!enableImageSizingUi && !!onRequestResizeImage;

      return (
        <Box
          component="img"
          src={src}
          alt={alt ?? ''}
          title={title}
          sx={{
            display: 'block',
            maxWidth: '100%',
            width: spec.width ?? undefined,
            height: spec.height ?? 'auto',
            cursor: clickable ? 'pointer' : 'default',
          }}
          onClick={
            clickable
              ? (e: any) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestResizeImage?.({ src, title, alt });
                }
              : undefined
          }
        />
      );
    },
  };

  const renderMarkdownChunk = (text: string, key: string | number) => (
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypeHighlight, rehypeSlug]}
      components={markdownComponents}
    >
      {text}
    </ReactMarkdown>
  );

  const renderWithTokens = () => {
    if (!recipeTokens?.ingredients && !recipeTokens?.steps) {
      return renderMarkdownChunk(markdown, 'markdown');
    }

    const parts: Array<
      { kind: 'md'; text: string } | { kind: 'ing' } | { kind: 'steps' }
    > = [];

    let remaining = markdown;
    while (true) {
      const iIng = remaining.indexOf(ING_TOKEN);
      const iSteps = remaining.indexOf(STEPS_TOKEN);
      if (iIng === -1 && iSteps === -1) {
        if (remaining) parts.push({ kind: 'md', text: remaining });
        break;
      }

      const nextIsIng = iIng !== -1 && (iSteps === -1 || iIng < iSteps);
      const idx = nextIsIng ? iIng : iSteps;
      const tokLen = nextIsIng ? ING_TOKEN.length : STEPS_TOKEN.length;
      const before = remaining.slice(0, idx);
      if (before) parts.push({ kind: 'md', text: before });
      parts.push(nextIsIng ? { kind: 'ing' } : { kind: 'steps' });
      remaining = remaining.slice(idx + tokLen);
    }

    return (
      <>
        {parts.map((p, i) => {
          if (p.kind === 'md') return renderMarkdownChunk(p.text, i);
          if (p.kind === 'ing') return <React.Fragment key={i}>{recipeTokens?.ingredients ?? null}</React.Fragment>;
          return <React.Fragment key={i}>{recipeTokens?.steps ?? null}</React.Fragment>;
        })}
      </>
    );
  };

  return (
    <Box
      ref={contentRef}
      className={className ?? 'markdown-body'}
      sx={{
        '& h1, & h2, & h3, & h4, & h5, & h6': { scrollMarginTop: '84px' },

        '& .toc-target-flash': {
          outline: '2px solid rgba(25, 118, 210, 0.35)',
          borderRadius: 1,
          transition: 'outline 200ms ease',
        },

        ...sx,
      }}
    >
      {enableToc && promptTocItems.length > 0 && (
        <Box sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Table of contents
            </Typography>
            <IconButton
              size="small"
              onClick={() => setTocOpen((v) => !v)}
              aria-label="Toggle table of contents"
            >
              {tocOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Box>

          <Collapse in={tocOpen}>
            <List
              dense
              disablePadding
              sx={{
                mt: 0.5,
                // single-spaced TOC
                '& .MuiListItemButton-root': { py: 0, minHeight: 'unset' },
                '& .MuiListItemText-root': { my: 0 },
                '& .MuiListItemText-primary': { lineHeight: 1.1, fontSize: '0.9rem' },
              }}
            >
              {promptTocItems.map((it) => (
                <ListItemButton
                  key={it.anchorId}
                  onClick={() => jumpToId(it.anchorId)}
                  disableGutters
                  sx={{ pl: 1.5, pr: 0.5 }}
                >
                  <ListItemText primary={`${it.turnIndex + 1}. ${it.label}`} />
                </ListItemButton>
              ))}
            </List>
          </Collapse>
        </Box>
      )}

      {renderWithTokens()}
    </Box>
  );
}
