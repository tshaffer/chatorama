import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Drawer,
  Stack,
  Typography,
} from '@mui/material';
import { IS_DEV } from './isDev';

export type SearchDebugPanelProps = {
  request: unknown;
  queryState: {
    isUninitialized?: boolean;
    isLoading?: boolean;
    isFetching?: boolean;
    isSuccess?: boolean;
    isError?: boolean;
    error?: unknown;
  };
  response?: unknown;
  spec?: unknown;
  title?: string;
};

type StringifyResult = {
  text: string;
  truncated: boolean;
};

function safeStringify(value: unknown, maxLen = 50000): StringifyResult {
  const seen = new WeakSet();
  const text = JSON.stringify(
    value,
    (_k, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
      if (typeof v === 'bigint') return v.toString();
      return v;
    },
    2
  );

  if (text.length <= maxLen) return { text, truncated: false };
  return { text: `${text.slice(0, maxLen)}…`, truncated: true };
}

function summarizeResponse(response: unknown) {
  if (!response) return { kind: 'empty' as const };
  if (Array.isArray(response)) {
    const ids = response
      .map((r: any) => r?.id ?? r?._id)
      .filter(Boolean)
      .slice(0, 10);
    return { kind: 'array' as const, count: response.length, ids };
  }
  if (typeof response === 'object') {
    const r = response as any;
    if (Array.isArray(r.results)) {
      const ids = r.results
        .map((x: any) => x?.id ?? x?._id)
        .filter(Boolean)
        .slice(0, 10);
      return { kind: 'results' as const, count: r.results.length, ids };
    }
    if (Array.isArray(r.items)) {
      const ids = r.items
        .map((x: any) => x?.id ?? x?._id)
        .filter(Boolean)
        .slice(0, 10);
      return { kind: 'items' as const, count: r.items.length, ids };
    }
    return { kind: 'object' as const, keys: Object.keys(r).sort() };
  }
  return { kind: 'primitive' as const, value: response };
}

export default function SearchDebugPanel(props: SearchDebugPanelProps) {
  const { request, queryState, response, spec, title } = props;
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!IS_DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const isToggle =
        (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd';
      if (!isToggle) return;
      e.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const responseSummary = useMemo(() => summarizeResponse(response), [response]);
  const stringified = useMemo(
    () =>
      safeStringify({ spec, request, queryState, response }, showMore ? 200000 : 50000),
    [spec, request, queryState, response, showMore]
  );
  const displayText = stringified.text;
  const showToggle = stringified.truncated && !showMore;

  if (!IS_DEV) return null;

  return (
    <>
      <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1300 }}>
        <Button variant="outlined" size="small" onClick={() => setOpen(true)}>
          Debug
        </Button>
      </Box>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 360, p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle1">{title || 'Search Debug'}</Typography>
              <Button size="small" onClick={() => setOpen(false)}>
                Close
              </Button>
            </Stack>
            <Divider />
            <Box>
              <Typography variant="subtitle2">Query State</Typography>
              <Typography variant="body2" color="text.secondary">
                {[
                  queryState.isUninitialized ? 'uninitialized' : null,
                  queryState.isLoading ? 'loading' : null,
                  queryState.isFetching ? 'fetching' : null,
                  queryState.isSuccess ? 'success' : null,
                  queryState.isError ? 'error' : null,
                ]
                  .filter(Boolean)
                  .join(' • ') || 'idle'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2">Response Summary</Typography>
              <Typography variant="body2" color="text.secondary">
                {safeStringify(responseSummary, 2000).text}
              </Typography>
            </Box>
            <Divider />
            <Box>
              <Typography variant="subtitle2">Payload</Typography>
              <Box
                component="pre"
                sx={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                  bgcolor: 'action.hover',
                  p: 1,
                  borderRadius: 1,
                  maxHeight: 320,
                  overflow: 'auto',
                }}
              >
                {displayText}
              </Box>
              {showToggle ? (
                <Button size="small" onClick={() => setShowMore(true)}>
                  Show more
                </Button>
              ) : null}
            </Box>
          </Stack>
        </Box>
      </Drawer>
    </>
  );
}
