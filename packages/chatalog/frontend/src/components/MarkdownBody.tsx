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

export default function MarkdownBody({ markdown, className, sx, enableToc = true }: Props) {
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

      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight, rehypeSlug]}
        components={{
          // Inject an anchor at each rendered "**Prompt**" marker
          strong: ({ children, ...rest }) => {
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

          a: ({ href, children, ...rest }) => {
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
        }}
      >
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}
