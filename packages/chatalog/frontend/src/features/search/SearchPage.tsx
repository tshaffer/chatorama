import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SearchMode } from '@chatorama/chatalog-shared';
import { useGetSearchQuery } from './searchApi';
import { useGetSubjectsWithTopicsQuery, resolveSubjectAndTopicNames } from '../subjects/subjectsApi';
import SearchBox from '../../components/SearchBox';
import { parseSearchInput } from './queryParser';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';

function clampLimit(n: number) {
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

function useQueryParam(name: string): string {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search).get(name) ?? '', [search, name]);
}

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const qParam = useQueryParam('q');

  const [q, setQ] = useState('');
  const [queryText, setQueryText] = useState<string>(q ?? '');
  const [mode, setMode] = useState<SearchMode>('auto');
  const [limit, setLimit] = useState<number>(20);
  const [activeRowIndex, setActiveRowIndex] = useState<number>(-1);
  const [overrideTopicId, setOverrideTopicId] = useState<string | null>(null);
  const [overrideSubjectId, setOverrideSubjectId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const nextQ = qParam.trim();
    if (nextQ !== q) setQ(nextQ);
  }, [qParam, q]);

  useEffect(() => {
    setQueryText(q ?? '');
  }, [q]);

  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const topicIdFromQuery = urlParams.get('topicId')?.trim() || '';
  const subjectIdFromQuery = urlParams.get('subjectId')?.trim() || '';
  const statusFromQuery = urlParams.get('status')?.trim() || '';
  const tagsFromQueryRaw = urlParams.get('tags')?.trim() || '';
  const tagsFromQuery = tagsFromQueryRaw
    ? tagsFromQueryRaw.split(',').map((t) => t.trim()).filter(Boolean)
    : [];
  const updatedFrom = urlParams.get('updatedFrom')?.trim() || '';
  const updatedTo = urlParams.get('updatedTo')?.trim() || '';
  const minSemanticScoreFromQueryRaw = urlParams.get('minSemanticScore');
  const minSemanticScoreFromQuery =
    minSemanticScoreFromQueryRaw != null && minSemanticScoreFromQueryRaw.trim() !== ''
      ? Number(minSemanticScoreFromQueryRaw)
      : undefined;
  const minSemanticScore = Number.isFinite(minSemanticScoreFromQuery as any)
    ? Math.max(0, Math.min(1, minSemanticScoreFromQuery as number))
    : undefined;

  const [draftMode, setDraftMode] = useState<string>(mode !== 'auto' ? mode : 'hybrid');
  const [draftMinSemantic, setDraftMinSemantic] = useState<number | ''>(
    minSemanticScore !== undefined ? minSemanticScore : '',
  );
  const [draftUpdatedFrom, setDraftUpdatedFrom] = useState<string>(updatedFrom || '');
  const [draftUpdatedTo, setDraftUpdatedTo] = useState<string>(updatedTo || '');

  const stateAny = (location.state ?? {}) as any;
  const topicIdFromState = String(stateAny.topicId ?? '').trim();
  const subjectIdFromState = String(stateAny.subjectId ?? '').trim();

  const topicIdFromRoute = String((params as any).topicId ?? '').trim();
  const subjectIdFromRoute = String((params as any).subjectId ?? '').trim();

  const effectiveTopicId =
    overrideTopicId !== null
      ? overrideTopicId
      : topicIdFromQuery || topicIdFromState || topicIdFromRoute || undefined;

  const effectiveSubjectId =
    overrideSubjectId !== null
      ? overrideSubjectId
      : subjectIdFromQuery || subjectIdFromState || subjectIdFromRoute || undefined;

  const trimmedQ = q.trim();
  const debouncedQ = useDebouncedValue(trimmedQ, 350);
  const shouldQuery = debouncedQ.length > 0;
  const highlightTokens = useMemo(
    () => tokenizeForHighlight(debouncedQ || trimmedQ || q),
    [debouncedQ, trimmedQ, q],
  );

  const args = useMemo(
    () => ({
      q: debouncedQ,
      mode,
      limit: clampLimit(limit),
      ...(effectiveSubjectId ? { subjectId: effectiveSubjectId } : {}),
      ...(effectiveTopicId ? { topicId: effectiveTopicId } : {}),
      ...(minSemanticScore !== undefined ? { minSemanticScore } : {}),
    }),
    [debouncedQ, mode, limit, effectiveSubjectId, effectiveTopicId, minSemanticScore],
  );

  const { data, error, isFetching } = useGetSearchQuery(args, { skip: !shouldQuery });
  const { data: subjectsWithTopics = [] } = useGetSubjectsWithTopicsQuery();

  const results = data?.results ?? [];
  const { subjectName: effectiveSubjectName, topicName: effectiveTopicName } = useMemo(() => {
    if (!effectiveSubjectId && !effectiveTopicId) {
      return { subjectName: undefined, topicName: undefined };
    }

    return resolveSubjectAndTopicNames(
      subjectsWithTopics as any,
      effectiveSubjectId,
      effectiveTopicId,
    );
  }, [subjectsWithTopics, effectiveSubjectId, effectiveTopicId]);

  const keywordResults = useMemo(
    () => (results ?? []).filter((r) => Array.isArray(r.sources) && r.sources.includes('keyword')),
    [results],
  );

  const semanticOnlyResults = useMemo(
    () =>
      (results ?? []).filter(
        (r) =>
          Array.isArray(r.sources) &&
          r.sources.includes('semantic') &&
          !r.sources.includes('keyword'),
      ),
    [results],
  );

  type DisplayRow =
    | { kind: 'header'; id: string; label: string }
    | { kind: 'result'; id: string; r: (typeof results)[number] };

  const displayRows: DisplayRow[] = useMemo(() => {
    if (mode !== 'hybrid') {
      return (results ?? []).map((r) => ({ kind: 'result' as const, id: r.id, r }));
    }

    const rows: DisplayRow[] = [];
    if (keywordResults.length) {
      rows.push({ kind: 'header', id: 'hdr_keyword', label: 'Keyword matches' });
      rows.push(...keywordResults.map((r) => ({ kind: 'result' as const, id: r.id, r })));
    }
    if (semanticOnlyResults.length) {
      rows.push({ kind: 'header', id: 'hdr_semantic', label: 'Semantic matches' });
      rows.push(...semanticOnlyResults.map((r) => ({ kind: 'result' as const, id: r.id, r })));
    }

    if (rows.length === 0) {
      return (results ?? []).map((r) => ({ kind: 'result' as const, id: r.id, r }));
    }

    return rows;
  }, [mode, results, keywordResults, semanticOnlyResults]);

  const selectableRowIndexes = useMemo(() => {
    const idxs: number[] = [];
    displayRows.forEach((row, i) => {
      if (row.kind === 'result') idxs.push(i);
    });
    return idxs;
  }, [displayRows]);

  const currentParamMap = useMemo(
    () =>
      toParamMap({
        q: trimmedQ,
        mode,
        subjectId: effectiveSubjectId,
        topicId: effectiveTopicId,
        status: statusFromQuery,
        tags: tagsFromQuery,
        updatedFrom,
        updatedTo,
        minSemanticScore,
      }),
    [
      trimmedQ,
      mode,
      effectiveSubjectId,
      effectiveTopicId,
      statusFromQuery,
      tagsFromQuery,
      updatedFrom,
      updatedTo,
      minSemanticScore,
    ],
  );

  const goWithParams = useCallback(
    (nextMap: Record<string, string | undefined | null>) => {
      navigate(buildSearchUrl(nextMap));
    },
    [navigate],
  );

  const onSubmitQuery = () => {
    const parsed = parseSearchInput(queryText);
    if (!parsed.q && Object.keys(parsed.params).length === 0) return;

    const next = { ...currentParamMap };
    if (parsed.q) next.q = parsed.q;
    else delete (next as any).q;

    for (const [k, v] of Object.entries(parsed.params)) {
      if (v) (next as any)[k] = String(v);
      else delete (next as any)[k];
    }

    goWithParams(next);
  };

  const openFilters = () => {
    setDraftMode(mode !== 'auto' ? mode : 'hybrid');
    setDraftMinSemantic(minSemanticScore !== undefined ? minSemanticScore : '');
    setDraftUpdatedFrom(updatedFrom || '');
    setDraftUpdatedTo(updatedTo || '');
    setFiltersOpen(true);
  };

  const applyDraftFilters = () => {
    const next = { ...currentParamMap };
    next.mode = draftMode;
    setMode(draftMode as SearchMode);

    if (draftMinSemantic === '' || Number.isNaN(Number(draftMinSemantic))) {
      delete (next as any).minSemanticScore;
    } else {
      next.minSemanticScore = String(draftMinSemantic);
    }

    if (!draftUpdatedFrom.trim()) delete (next as any).updatedFrom;
    else next.updatedFrom = draftUpdatedFrom.trim();

    if (!draftUpdatedTo.trim()) delete (next as any).updatedTo;
    else next.updatedTo = draftUpdatedTo.trim();

    goWithParams(next);
    setFiltersOpen(false);
  };

  const clearDraftAndApply = () => {
    const next = { ...currentParamMap };
    delete (next as any).mode;
    delete (next as any).minSemanticScore;
    delete (next as any).updatedFrom;
    delete (next as any).updatedTo;
    setMode('auto');
    goWithParams(next);
    setFiltersOpen(false);
  };

  const removeParam = useCallback(
    (key: string) => {
      const next = { ...currentParamMap };
      delete (next as any)[key];
      goWithParams(next);
    },
    [currentParamMap, goWithParams],
  );

  const hasAnyFilterChips = Boolean(
    effectiveSubjectId ||
      effectiveTopicId ||
      statusFromQuery ||
      tagsFromQuery.length ||
      updatedFrom ||
      updatedTo ||
      minSemanticScore !== undefined ||
      (mode && mode !== 'auto'),
  );

  useEffect(() => {
    setActiveRowIndex(-1);
  }, [displayRows]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target.isContentEditable) return;
      }

      if (filtersOpen) return;

      if (selectableRowIndexes.length === 0) return;

      const currentPos = selectableRowIndexes.indexOf(activeRowIndex);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextPos =
          currentPos < 0 ? 0 : Math.min(currentPos + 1, selectableRowIndexes.length - 1);
        setActiveRowIndex(selectableRowIndexes[nextPos]);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextPos = currentPos < 0 ? 0 : Math.max(currentPos - 1, 0);
        setActiveRowIndex(selectableRowIndexes[nextPos]);
        return;
      }

      if (e.key === 'Enter') {
        if (activeRowIndex < 0) return;
        const row = displayRows[activeRowIndex];
        if (row?.kind !== 'result') return;
        navigate(`/n/${row.r.id}`);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeRowIndex, selectableRowIndexes, displayRows, navigate, filtersOpen]);

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flexShrink: 0 }}>
        <Stack spacing={2}>
          <Typography variant="h5">Search</Typography>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Tooltip title="Edit the query in the Search box below and press Enter">
                <Box sx={{ width: '100%' }}>
                  <TextField
                    label="Query (read-only)"
                    value={q}
                    placeholder="Type to search..."
                    autoFocus
                    fullWidth
                    InputProps={{ readOnly: true }}
                    sx={(theme) => ({
                      '& .MuiInputBase-root': {
                        bgcolor: theme.palette.action.disabledBackground,
                      },
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: theme.palette.divider,
                        borderStyle: 'solid',
                      },
                    })}
                  />
                </Box>
              </Tooltip>

              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <ToggleButtonGroup
                  value={mode}
                  exclusive
                  onChange={(_e, v) => {
                    if (v) setMode(v);
                  }}
                  size="small"
                >
                  <ToggleButton value="auto">Auto</ToggleButton>
                  <ToggleButton value="hybrid">Hybrid</ToggleButton>
                  <ToggleButton value="semantic">Semantic</ToggleButton>
                  <ToggleButton value="keyword">Keyword</ToggleButton>
                </ToggleButtonGroup>

                <TextField
                  label="Limit"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  inputProps={{ min: 1, max: 50, step: 1 }}
                  size="small"
                  sx={{ width: 120 }}
                />

                {isFetching && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography variant="body2">Searching…</Typography>
                  </Stack>
                )}
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                {effectiveSubjectId || effectiveTopicId ? (
                  <Chip
                    label={`Within: ${[
                      effectiveSubjectName ??
                        (effectiveSubjectId ? `Subject ${effectiveSubjectId}` : ''),
                      effectiveTopicName ?? (effectiveTopicId ? `Topic ${effectiveTopicId}` : ''),
                    ]
                      .filter(Boolean)
                      .join(' / ')}`}
                    onDelete={() => {
                      setOverrideSubjectId('');
                      setOverrideTopicId('');
                    }}
                    size="small"
                    variant="outlined"
                  />
                ) : null}
              </Stack>

              {error ? (
                <Alert severity="error">Search failed. Check server logs.</Alert>
              ) : null}
            </Stack>
          </Paper>

          {!shouldQuery ? (
            <Typography variant="body2" color="text.secondary">
              Enter a query to search your notes
              {effectiveTopicId || effectiveSubjectId ? ' (filters active).' : '.'}
            </Typography>
          ) : null}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, mt: 2 }}>
        {shouldQuery ? (
          <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ px: 2, py: 1, flexShrink: 0 }}>
              <Typography variant="body2" color="text.secondary">
                {results.length} result{results.length === 1 ? '' : 's'}
                {data?.mode ? ` • mode: ${data.mode}` : ''}
              </Typography>
            </Box>
            <Box sx={{ px: 2, pb: 1, flexShrink: 0 }}>
              <SearchBox
                value={queryText}
                onChange={setQueryText}
                onSubmit={onSubmitQuery}
                placeholder="Search notes…"
                sx={(theme) => ({
                  width: '100%',
                  maxWidth: 720,
                  bgcolor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 999,
                })}
              />
            </Box>
            <Box sx={{ px: 2, pb: 1, flexShrink: 0 }}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ alignItems: 'center' }}>
                {hasAnyFilterChips && (
                  <>
                    {effectiveSubjectId || effectiveTopicId ? (
                      <Chip
                        label={`Within: ${[
                          effectiveSubjectName ??
                            (effectiveSubjectId ? `Subject ${effectiveSubjectId}` : ''),
                          effectiveTopicName ?? (effectiveTopicId ? `Topic ${effectiveTopicId}` : ''),
                        ]
                          .filter(Boolean)
                          .join(' / ')}`}
                        onDelete={() => {
                          const next = { ...currentParamMap };
                          delete (next as any).subjectId;
                          delete (next as any).topicId;
                          goWithParams(next);
                        }}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {mode && mode !== 'auto' ? (
                      <Chip
                        label={`Mode: ${mode}`}
                        onDelete={() => removeParam('mode')}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {minSemanticScore !== undefined ? (
                      <Chip
                        label={`Min semantic: ≥ ${minSemanticScore.toFixed(2)}`}
                        onDelete={() => removeParam('minSemanticScore')}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {statusFromQuery ? (
                      <Chip
                        label={`Status: ${statusFromQuery}`}
                        onDelete={() => removeParam('status')}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {tagsFromQuery.map((t) => (
                      <Chip
                        key={t}
                        label={`Tag: ${t}`}
                        onDelete={() => {
                          const nextTags = tagsFromQuery.filter((x) => x !== t);
                          const next = toParamMap({
                            q: trimmedQ,
                            mode,
                            subjectId: effectiveSubjectId,
                            topicId: effectiveTopicId,
                            status: statusFromQuery,
                            tags: nextTags,
                            updatedFrom,
                            updatedTo,
                            minSemanticScore,
                          });
                          goWithParams(next);
                        }}
                        size="small"
                        variant="outlined"
                      />
                    ))}

                    {updatedFrom ? (
                      <Chip
                        label={`Content updated from: ${updatedFrom}`}
                        onDelete={() => removeParam('updatedFrom')}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {updatedTo ? (
                      <Chip
                        label={`Content updated to: ${updatedTo}`}
                        onDelete={() => removeParam('updatedTo')}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}
                  </>
                )}

                <Button size="small" variant="outlined" onClick={openFilters}>
                  Add filters…
                </Button>
              </Stack>
            </Box>
            <Divider />
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: 0.5 }}>
              <List disablePadding>
                {displayRows.map((row, i) => {
                  if (row.kind === 'header') {
                    return (
                      <Box
                        key={row.id}
                        sx={{
                          px: 1,
                          py: 0.75,
                          mt: 1,
                          mb: 0.5,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: 'text.secondary',
                        }}
                      >
                        {row.label}
                      </Box>
                    );
                  }

                  const r = row.r;
                  const selected = i === activeRowIndex;

                  return (
                    <ListItemButton
                      key={row.id}
                      alignItems="flex-start"
                      selected={selected}
                      onMouseEnter={() => setActiveRowIndex(i)}
                      onClick={() => {
                        navigate(getNoteRoute(r.id));
                      }}
                    >
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                            <Typography
                              component="a"
                              href={`/n/${r.id}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              variant="subtitle1"
                              sx={{
                                mr: 1,
                                fontWeight: 600,
                                textDecoration: 'none',
                                color: 'inherit',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                            >
                              {r.title || '(Untitled)'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              score: {Number(r.score).toFixed(3)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              • sources: {r.sources.join(', ')}
                            </Typography>
                          </Stack>
                        }
                        secondary={
                          r.snippet ? (
                            <Typography variant="body2" color="text.secondary">
                              {r.sources?.includes('keyword')
                                ? renderHighlightedSnippet(r.snippet, highlightTokens)
                                : r.snippet}
                            </Typography>
                          ) : r.summary ? (
                            <Typography variant="body2" color="text.secondary">
                              {r.summary}
                            </Typography>
                          ) : null
                        }
                      />
                    </ListItemButton>
                  );
                })}
                {results.length === 0 ? (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      No results.
                    </Typography>
                  </Box>
                ) : null}
              </List>
            </Box>
          </Paper>
        ) : null}
      </Box>

      <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Filters</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Mode
              </Typography>
              <ToggleButtonGroup
                value={draftMode}
                exclusive
                onChange={(_e, v) => {
                  if (v) setDraftMode(v);
                }}
                size="small"
              >
                <ToggleButton value="hybrid">Hybrid</ToggleButton>
                <ToggleButton value="keyword">Keyword</ToggleButton>
                <ToggleButton value="semantic">Semantic</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <TextField
              label="Min semantic score"
              type="number"
              inputProps={{ min: 0, max: 1, step: 0.01 }}
              value={draftMinSemantic}
              onChange={(e) => {
                const s = e.target.value;
                if (s === '') setDraftMinSemantic('');
                else setDraftMinSemantic(Math.max(0, Math.min(1, Number(s))));
              }}
              helperText="Applies to Semantic/Hybrid. Leave blank for default."
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Content updated from"
                type="date"
                value={draftUpdatedFrom}
                onChange={(e) => setDraftUpdatedFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Content updated to"
                type="date"
                value={draftUpdatedTo}
                onChange={(e) => setDraftUpdatedTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={clearDraftAndApply}>Clear</Button>
          <Button onClick={() => setFiltersOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyDraftFilters}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function getNoteRoute(noteId: string): string {
  return `/n/${noteId}`;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeForHighlight(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.toLowerCase())
    .slice(0, 8);
}

function renderHighlightedSnippet(snippet: string, tokens: string[]): ReactNode {
  if (!snippet) return snippet;
  const toks = tokens.filter(Boolean);
  if (toks.length === 0) return snippet;

  const parts = toks.map((t) => {
    const e = escapeRegExp(t);
    return t.length >= 3 ? `\\b${e}\\b` : e;
  });

  const re = new RegExp(`(${parts.join('|')})`, 'ig');

  const split = snippet.split(re);
  if (split.length === 1) return snippet;

  return (
    <>
      {split.map((chunk, i) => {
        if (!chunk) return null;
        const isHit = re.test(chunk);
        re.lastIndex = 0;

        return isHit ? (
          <mark key={i} style={{ padding: 0, background: 'transparent', fontWeight: 700 }}>
            {chunk}
          </mark>
        ) : (
          <span key={i}>{chunk}</span>
        );
      })}
    </>
  );
}

function buildSearchUrl(next: Record<string, string | undefined | null>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    params.set(k, s);
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

function toParamMap(args: {
  q?: string;
  mode?: string;
  subjectId?: string;
  topicId?: string;
  status?: string;
  tags?: string[];
  updatedFrom?: string;
  updatedTo?: string;
  minSemanticScore?: number;
}) {
  return {
    q: args.q,
    mode: args.mode,
    subjectId: args.subjectId,
    topicId: args.topicId,
    status: args.status,
    tags: args.tags && args.tags.length ? args.tags.join(',') : undefined,
    updatedFrom: args.updatedFrom,
    updatedTo: args.updatedTo,
    minSemanticScore:
      args.minSemanticScore !== undefined ? String(args.minSemanticScore) : undefined,
  };
}
