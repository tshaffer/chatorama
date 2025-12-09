// frontend/src/components/MarkdownBody.tsx
import React from 'react';
import { Box } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

type Props = {
  markdown: string;
  className?: string;
  sx?: any;
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

export default function MarkdownBody({ markdown, className, sx }: Props) {
  return (
    <Box className={className ?? 'markdown-body'} sx={sx}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children, ...rest }) => {
            if (!isSafeHref(href)) {
              return <span {...rest}>{children}</span>;
            }
            return (
              <a
                {...rest}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
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
