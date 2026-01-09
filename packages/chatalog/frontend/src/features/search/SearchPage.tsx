import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SearchMode } from '@chatorama/chatalog-shared';
import {
  useCreateSavedSearchMutation,
  useDeleteSavedSearchMutation,
  useGetRecipeFacetsQuery,
  useGetSavedSearchesQuery,
  useGetSearchQuery,
} from './searchApi';
import { useGetSubjectsWithTopicsQuery, resolveSubjectAndTopicNames } from '../subjects/subjectsApi';
import SearchBox from '../../components/SearchBox';
import { parseSearchInput } from './queryParser';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  hydrateFromUrl,
  resetDraftToCommitted,
  setDraftMinSemanticScore,
  setDraftMode,
  setDraftText,
  setDraftUpdatedFrom,
  setDraftUpdatedTo,
  setFiltersDialogOpen,
} from './searchSlice';
import {
  selectFiltersDialogOpen,
  selectLastUsedScope,
  selectSearchCommitted,
  selectSearchDraft,
  selectSearchSpec,
} from './searchSelectors';
import {
  buildSearchUrlFromQuery,
  getDefaultSearchQuery,
  parseSearchQueryFromUrl,
} from './searchUrl';
import { buildSearchRequest } from './buildSearchRequest';
import SearchDebugPanel from './debug/SearchDebugPanel';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

function clampLimit(n: number) {
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const dispatch = useAppDispatch();
  const draft = useAppSelector(selectSearchDraft);
  const committed = useAppSelector(selectSearchCommitted);
  const lastUsedScope = useAppSelector(selectLastUsedScope);
  const baseSpec = useAppSelector(selectSearchSpec);
  const filtersOpen = useAppSelector(selectFiltersDialogOpen);

  const [activeRowIndex, setActiveRowIndex] = useState<number>(-1);
  const [overrideTopicId, setOverrideTopicId] = useState<string | null>(null);
  const [overrideSubjectId, setOverrideSubjectId] = useState<string | null>(null);
  const [draftCuisine, setDraftCuisine] = useState<string>('');
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [draftKeywords, setDraftKeywords] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string>('');
  const [explainEnabled, setExplainEnabled] = useState(false);
  const [explainOpenById, setExplainOpenById] = useState<Record<string, boolean>>({});
  useEffect(() => {
    dispatch(hydrateFromUrl(parseSearchQueryFromUrl(location.search)));
  }, [dispatch, location.search]);

  const topicIdFromQuery = committed.filters.topicId ?? '';
  const subjectIdFromQuery = committed.filters.subjectId ?? '';
  const statusFromQuery = committed.filters.status ?? '';
  const tagsFromQuery = committed.filters.tags ?? [];
  const updatedFrom = committed.filters.updatedFrom ?? '';
  const updatedTo = committed.filters.updatedTo ?? '';
  const minSemanticScore = committed.filters.minSemanticScore;
  const maxPrepMinutes = committed.filters.prepTimeMax;
  const maxCookMinutes = committed.filters.cookTimeMax;
  const maxTotalMinutes = committed.filters.totalTimeMax;
  const cuisineValues = (committed.filters.cuisine ?? []).map((t) => t.trim()).filter(Boolean);
  const categoryValues = (committed.filters.category ?? []).map((t) => t.trim()).filter(Boolean);
  const keywordValues = (committed.filters.keywords ?? []).map((t) => t.trim()).filter(Boolean);
  const isRecipeScope = committed.scope === 'recipes';
  const { data: recipeFacets } = useGetRecipeFacetsQuery(undefined, { skip: !isRecipeScope });
  const { data: savedSearchesData } = useGetSavedSearchesQuery();
  const savedSearches = savedSearchesData?.items ?? [];
  const [createSavedSearch, createSavedSearchState] = useCreateSavedSearchMutation();
  const [deleteSavedSearch] = useDeleteSavedSearchMutation();

  const cuisineCounts = useMemo(() => {
    return new Map((recipeFacets?.cuisines ?? []).map((b) => [b.value, b.count]));
  }, [recipeFacets]);

  const categoryCounts = useMemo(() => {
    return new Map((recipeFacets?.categories ?? []).map((b) => [b.value, b.count]));
  }, [recipeFacets]);

  const keywordCounts = useMemo(() => {
    return new Map((recipeFacets?.keywords ?? []).map((b) => [b.value, b.count]));
  }, [recipeFacets]);

  const cuisineOptions = useMemo(() => {
    const vals = new Set((recipeFacets?.cuisines ?? []).map((b) => b.value));
    if (draftCuisine) vals.add(draftCuisine);
    return Array.from(vals);
  }, [recipeFacets, draftCuisine]);

  const categoryOptions = useMemo(() => {
    const vals = new Set((recipeFacets?.categories ?? []).map((b) => b.value));
    draftCategories.forEach((v) => vals.add(v));
    return Array.from(vals);
  }, [recipeFacets, draftCategories]);

  const keywordOptions = useMemo(() => {
    const vals = new Set((recipeFacets?.keywords ?? []).map((b) => b.value));
    draftKeywords.forEach((v) => vals.add(v));
    return Array.from(vals);
  }, [recipeFacets, draftKeywords]);


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

  const trimmedQ = committed.text.trim();
  const debouncedQ = useDebouncedValue(trimmedQ, 350);
  const shouldQuery = debouncedQ.length > 0 || trimmedQ === '';
  const highlightTokens = useMemo(
    () => tokenizeForHighlight(debouncedQ || trimmedQ || committed.text),
    [debouncedQ, trimmedQ, committed.text],
  );

  const effectiveScope =
    trimmedQ === ''
      ? committed.scope === 'notes' || committed.scope === 'recipes'
        ? committed.scope
        : lastUsedScope
      : committed.scope;

  const effectiveSpec = useMemo(
    () => ({
      ...baseSpec,
      scope: effectiveScope,
      filters: {
        ...baseSpec.filters,
        subjectId: effectiveSubjectId ?? baseSpec.filters.subjectId,
        topicId: effectiveTopicId ?? baseSpec.filters.topicId,
        minSemanticScore,
        prepTimeMax: maxPrepMinutes,
        cookTimeMax: maxCookMinutes,
        totalTimeMax: maxTotalMinutes,
        cuisine: cuisineValues,
        category: categoryValues,
        keywords: keywordValues,
        includeIngredients: (committed.filters.includeIngredients ?? [])
          .map((t) => t.trim())
          .filter(Boolean),
        excludeIngredients: (committed.filters.excludeIngredients ?? [])
          .map((t) => t.trim())
          .filter(Boolean),
      },
    }),
    [
      baseSpec,
      effectiveScope,
      effectiveSubjectId,
      effectiveTopicId,
      minSemanticScore,
      maxPrepMinutes,
      maxCookMinutes,
      maxTotalMinutes,
      cuisineValues,
      categoryValues,
      keywordValues,
      committed.filters.includeIngredients,
      committed.filters.excludeIngredients,
    ],
  );

  const requestSpec = useMemo(
    () => ({
      ...effectiveSpec,
      query: debouncedQ.trim() === '' ? '*' : debouncedQ,
      mode: committed.mode as SearchMode,
      limit: clampLimit(committed.limit),
      explain: explainEnabled && committed.mode === 'hybrid',
    }),
    [effectiveSpec, debouncedQ, committed.mode, committed.limit, explainEnabled],
  );

  const requestForDebug = useMemo(
    () => buildSearchRequest(requestSpec, { explain: explainEnabled }),
    [requestSpec, explainEnabled],
  );

  const {
    data,
    error,
    isFetching,
    isLoading,
    isSuccess,
    isError,
    isUninitialized,
    refetch,
  } = useGetSearchQuery(requestSpec, { skip: !shouldQuery });
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
    if (committed.mode !== 'hybrid') {
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
  }, [committed.mode, results, keywordResults, semanticOnlyResults]);

  const selectableRowIndexes = useMemo(() => {
    const idxs: number[] = [];
    displayRows.forEach((row, i) => {
      if (row.kind === 'result') idxs.push(i);
    });
    return idxs;
  }, [displayRows]);

  const toggleExplainForId = useCallback((id: string) => {
    setExplainOpenById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const formatExplainNumber = useCallback((value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
    return value.toFixed(4);
  }, []);

  const applyCommitted = useCallback(
    (nextQuery: typeof committed) => {
      dispatch(hydrateFromUrl(nextQuery));
      navigate(buildSearchUrlFromQuery(nextQuery));
    },
    [dispatch, navigate],
  );

  const normalizeSavedQuery = useCallback((q: typeof committed) => {
    const base = getDefaultSearchQuery();
    return {
      ...base,
      ...q,
      filters: {
        ...base.filters,
        ...(q?.filters ?? {}),
      },
    };
  }, []);

  const onSubmitQuery = () => {
    const parsed = parseSearchInput(draft.text);
    const nextText = (parsed.q ?? '').trim();
    const isEmptySubmit = nextText === '' && Object.keys(parsed.params).length === 0;

    const scopeParam = (parsed.params.scope ?? '').trim().toLowerCase();
    const scope =
      scopeParam === 'recipes' || scopeParam === 'notes' || scopeParam === 'all'
        ? scopeParam
        : undefined;

    const nextQuery = {
      ...committed,
      text: nextText,
      ...(scope ? { scope: scope as any } : {}),
      filters: {
        ...committed.filters,
        tags: parsed.params.tags
          ? parsed.params.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        status: parsed.params.status?.trim() || undefined,
        updatedFrom: parsed.params.updatedFrom?.trim() || undefined,
        updatedTo: parsed.params.updatedTo?.trim() || undefined,
      },
    };

    applyCommitted(nextQuery);
    if (isEmptySubmit) {
      refetch();
    }
  };

  const openFilters = () => {
    dispatch(resetDraftToCommitted());
    setDraftCuisine(cuisineValues[0] ?? '');
    setDraftCategories(categoryValues);
    setDraftKeywords(keywordValues);
    dispatch(setFiltersDialogOpen(true));
  };

  const applyDraftFilters = () => {
    const nextFilters = { ...draft.filters };
    if (isRecipeScope) {
      const cuisine = draftCuisine.trim();
      nextFilters.cuisine = cuisine ? [cuisine] : [];

      const categories = draftCategories
        .map((t) => t.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      nextFilters.category = categories;

      const keywords = draftKeywords
        .map((t) => t.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      nextFilters.keywords = keywords;
    }

    const nextQuery = { ...draft, filters: nextFilters };
    dispatch(hydrateFromUrl(nextQuery));
    navigate(buildSearchUrlFromQuery(nextQuery));
    dispatch(setFiltersDialogOpen(false));
  };

  const clearDraftAndApply = () => {
    const nextQuery = {
      ...committed,
      mode: 'auto' as const,
      filters: {
        ...committed.filters,
        minSemanticScore: undefined,
        updatedFrom: undefined,
        updatedTo: undefined,
        ...(isRecipeScope
          ? {
            cuisine: [],
            category: [],
            keywords: [],
          }
          : {}),
      },
    };
    setDraftCuisine('');
    setDraftCategories([]);
    setDraftKeywords([]);
    applyCommitted(nextQuery);
    dispatch(setFiltersDialogOpen(false));
  };

  const hasAnyFilterChips = Boolean(
    effectiveSubjectId ||
    effectiveTopicId ||
    statusFromQuery ||
    tagsFromQuery.length ||
    updatedFrom ||
    updatedTo ||
    minSemanticScore !== undefined ||
    (isRecipeScope &&
      (cuisineValues.length || categoryValues.length || keywordValues.length)) ||
    (committed.mode && committed.mode !== 'auto'),
  );

  const openSaveDialog = () => {
    setSaveName('');
    setSaveErrorMessage('');
    setSaveDialogOpen(true);
  };

  const saveCurrentSearch = async () => {
    const name = saveName.trim();
    if (!name) return;
    const queryToSave = committed;
    try {
      await createSavedSearch({ name, query: queryToSave }).unwrap();
      setSaveDialogOpen(false);
      setSaveName('');
      setSaveErrorMessage('');
    } catch (err: any) {
      if (err?.status === 409) {
        setSaveErrorMessage('A saved search with this name already exists.');
      } else {
        setSaveErrorMessage('Failed to save search.');
      }
    }
  };

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
                    value={committed.text}
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
                  value={committed.scope}
                  exclusive
                  onChange={(_e, v) => {
                    if (!v) return;
                    const nextQuery = {
                      ...committed,
                      scope: v as any,
                      filters:
                        v === 'recipes'
                          ? committed.filters
                          : { ...committed.filters, cuisine: [], category: [], keywords: [] },
                    };
                    applyCommitted(nextQuery);
                  }}
                  size="small"
                >
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="recipes">Recipes</ToggleButton>
                </ToggleButtonGroup>

                <ToggleButtonGroup
                  value={committed.mode}
                  exclusive
                  onChange={(_e, v) => {
                    if (!v) return;
                    const nextQuery = { ...committed, mode: v as any };
                    applyCommitted(nextQuery);
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
                  value={committed.limit}
                  onChange={(e) => {
                    const nextLimit = clampLimit(Number(e.target.value));
                    const nextQuery = { ...committed, limit: nextLimit };
                    applyCommitted(nextQuery);
                  }}
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
                      const nextQuery = {
                        ...committed,
                        filters: {
                          ...committed.filters,
                          subjectId: undefined,
                          topicId: undefined,
                        },
                      };
                      applyCommitted(nextQuery);
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
      <Box sx={{ mt: 2 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2">Saved searches</Typography>
              <Button size="small" variant="outlined" onClick={openSaveDialog}>
                Save search…
              </Button>
            </Stack>
            {savedSearches.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                None yet.
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                {savedSearches.map((s) => (
                  <Stack
                    key={s.id}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ width: '100%' }}
                  >
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => {
                        const normalized = normalizeSavedQuery(s.query as any);
                        applyCommitted(normalized);
                      }}
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      fullWidth
                    >
                      {s.name}
                    </Button>
                    <Tooltip title="Delete saved search">
                      <IconButton
                        size="small"
                        onClick={() => deleteSavedSearch(s.id)}
                        aria-label={`Delete ${s.name}`}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, mt: 2 }}>
        {shouldQuery ? (
          <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ px: 2, py: 1, flexShrink: 0 }}>
              <Typography variant="body2" color="text.secondary">
                {results.length} result{results.length === 1 ? '' : 's'}
                {data?.mode ? ` • mode: ${data.mode}` : ''}
                {committed.scope !== 'all' ? ` • scope: ${committed.scope}` : ''}
                {committed.mode === 'hybrid' ? ' • hybrid: RRF' : ''}
              </Typography>
            </Box>
            <Box sx={{ px: 2, pb: 1, flexShrink: 0 }}>
              <SearchBox
                value={draft.text}
                onChange={(v) => dispatch(setDraftText(v))}
                onSubmit={onSubmitQuery}
                placeholder="Search…"
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
                          const nextQuery = {
                            ...committed,
                            filters: {
                              ...committed.filters,
                              subjectId: undefined,
                              topicId: undefined,
                            },
                          };
                          applyCommitted(nextQuery);
                          setOverrideSubjectId('');
                          setOverrideTopicId('');
                        }}
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {committed.mode && committed.mode !== 'auto' ? (
                      <Chip
                        label={`Mode: ${committed.mode}`}
                        onDelete={() =>
                          applyCommitted({
                            ...committed,
                            mode: 'auto',
                          })
                        }
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {minSemanticScore !== undefined ? (
                      <Chip
                        label={`Min semantic: ≥ ${minSemanticScore.toFixed(2)}`}
                        onDelete={() =>
                          applyCommitted({
                            ...committed,
                            filters: { ...committed.filters, minSemanticScore: undefined },
                          })
                        }
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {statusFromQuery ? (
                      <Chip
                        label={`Status: ${statusFromQuery}`}
                        onDelete={() =>
                          applyCommitted({
                            ...committed,
                            filters: { ...committed.filters, status: undefined },
                          })
                        }
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
                          applyCommitted({
                            ...committed,
                            filters: { ...committed.filters, tags: nextTags },
                          });
                        }}
                        size="small"
                        variant="outlined"
                      />
                    ))}

                    {updatedFrom ? (
                      <Chip
                        label={`Content updated from: ${updatedFrom}`}
                        onDelete={() =>
                          applyCommitted({
                            ...committed,
                            filters: { ...committed.filters, updatedFrom: undefined },
                          })
                        }
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {updatedTo ? (
                      <Chip
                        label={`Content updated to: ${updatedTo}`}
                        onDelete={() =>
                          applyCommitted({
                            ...committed,
                            filters: { ...committed.filters, updatedTo: undefined },
                          })
                        }
                        size="small"
                        variant="outlined"
                      />
                    ) : null}

                    {isRecipeScope
                      ? cuisineValues.map((c) => (
                        <Chip
                          key={`cuisine-${c}`}
                          label={`Cuisine: ${c}`}
                          onDelete={() => {
                            const nextCuisine = cuisineValues.filter((x) => x !== c);
                            applyCommitted({
                              ...committed,
                              filters: {
                                ...committed.filters,
                                cuisine: nextCuisine.sort((a, b) => a.localeCompare(b)),
                              },
                            });
                          }}
                          size="small"
                          variant="outlined"
                        />
                      ))
                      : null}

                    {isRecipeScope
                      ? categoryValues.map((c) => (
                        <Chip
                          key={`category-${c}`}
                          label={`Category: ${c}`}
                          onDelete={() => {
                            const nextCategories = categoryValues.filter((x) => x !== c);
                            applyCommitted({
                              ...committed,
                              filters: {
                                ...committed.filters,
                                category: nextCategories.sort((a, b) => a.localeCompare(b)),
                              },
                            });
                          }}
                          size="small"
                          variant="outlined"
                        />
                      ))
                      : null}

                    {isRecipeScope
                      ? keywordValues.map((k) => (
                        <Chip
                          key={`keyword-${k}`}
                          label={`Keyword: ${k}`}
                          onDelete={() => {
                            const nextKeywords = keywordValues.filter((x) => x !== k);
                            applyCommitted({
                              ...committed,
                              filters: {
                                ...committed.filters,
                                keywords: nextKeywords.sort((a, b) => a.localeCompare(b)),
                              },
                            });
                          }}
                          size="small"
                          variant="outlined"
                        />
                      ))
                      : null}
                  </>
                )}
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={explainEnabled}
                      onChange={(_e, checked) => setExplainEnabled(checked)}
                      disabled={committed.mode !== 'hybrid'}
                    />
                  }
                  label="Explain results"
                />

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
                  const explain = r.explain;
                  const canExplain = committed.mode === 'hybrid' && explainEnabled && !!explain;
                  const explainOpen = Boolean(explainOpenById[r.id]);

                  return (
                    <Box key={row.id}>
                      <ListItemButton
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
                              {canExplain ? (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleExplainForId(r.id);
                                  }}
                                >
                                  Why this matched
                                </Button>
                              ) : null}
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
                      {canExplain ? (
                        <Collapse in={explainOpen} timeout="auto" unmountOnExit>
                          <Box sx={{ px: 2, pb: 1.5 }}>
                            <Stack spacing={1}>
                              <Box
                                sx={{
                                  bgcolor: 'action.hover',
                                  px: 1,
                                  py: 0.5,
                                  borderRadius: 1,
                                }}
                              >
                                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                  {explain?.sources?.keyword && explain?.sources?.semantic
                                    ? 'Matched by keyword and semantic similarity'
                                    : explain?.sources?.keyword
                                    ? 'Matched by keyword only'
                                    : 'Matched by semantic similarity only'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {(() => {
                                    const keywordContribution =
                                      explain?.fusion?.contributions?.keyword;
                                    const semanticContribution =
                                      explain?.fusion?.contributions?.semantic;
                                    if (keywordContribution == null || semanticContribution == null) {
                                      return keywordContribution != null
                                        ? 'Ranking dominated by keyword match'
                                        : 'Ranking dominated by semantic similarity';
                                    }
                                    if (keywordContribution > semanticContribution) {
                                      return 'Ranking dominated by keyword match';
                                    }
                                    if (semanticContribution > keywordContribution) {
                                      return 'Ranking dominated by semantic similarity';
                                    }
                                    return 'Keyword and semantic contributed equally';
                                  })()}
                                </Typography>
                              </Box>
                              <Box>
                                <Typography variant="overline" color="text.secondary">
                                  Source details
                                </Typography>
                                <Stack spacing={0.5}>
                                  {explain?.sources?.keyword?.rank != null ? (
                                    <Typography variant="caption" color="text.secondary">
                                      Keyword rank: {explain.sources.keyword.rank}
                                      {explain?.fusion?.contributions?.keyword != null &&
                                      explain?.fusion?.k != null
                                        ? ` • 1 / (${explain.fusion.k} + ${explain.sources.keyword.rank}) = ${formatExplainNumber(
                                            explain.fusion.contributions.keyword,
                                          )}`
                                        : ''}
                                    </Typography>
                                  ) : null}
                                  {explain?.sources?.semantic?.rank != null ? (
                                    <Typography variant="caption" color="text.secondary">
                                      Semantic rank: {explain.sources.semantic.rank}
                                      {explain?.sources?.semantic?.score != null
                                        ? ` • raw score: ${formatExplainNumber(
                                            explain.sources.semantic.score,
                                          )}`
                                        : ''}
                                      {explain?.fusion?.contributions?.semantic != null &&
                                      explain?.fusion?.k != null
                                        ? ` • 1 / (${explain.fusion.k} + ${explain.sources.semantic.rank}) = ${formatExplainNumber(
                                            explain.fusion.contributions.semantic,
                                          )}`
                                        : ''}
                                    </Typography>
                                  ) : null}
                                </Stack>
                              </Box>
                              <Box>
                                <Typography variant="overline" color="text.secondary">
                                  Fusion result
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Method: {explain?.fusion?.method ?? 'rrf'}
                                  {explain?.fusion?.combinedScore != null
                                    ? ` • combined score: ${formatExplainNumber(
                                        explain.fusion.combinedScore,
                                      )}`
                                    : ''}
                                </Typography>
                              </Box>
                            </Stack>
                          </Box>
                        </Collapse>
                      ) : null}
                    </Box>
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

      <Dialog
        open={filtersOpen}
        onClose={() => dispatch(setFiltersDialogOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Filters</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Mode
              </Typography>
              <ToggleButtonGroup
                value={draft.mode}
                exclusive
                onChange={(_e, v) => {
                  if (v) dispatch(setDraftMode(v as any));
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
              value={draft.filters.minSemanticScore ?? ''}
              onChange={(e) => {
                const s = e.target.value;
                if (s === '') dispatch(setDraftMinSemanticScore(undefined));
                else dispatch(setDraftMinSemanticScore(Math.max(0, Math.min(1, Number(s)))));
              }}
              helperText="Applies to Semantic/Hybrid. Leave blank for default."
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Content updated from"
                type="date"
                value={draft.filters.updatedFrom ?? ''}
                onChange={(e) => dispatch(setDraftUpdatedFrom(e.target.value))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="Content updated to"
                type="date"
                value={draft.filters.updatedTo ?? ''}
                onChange={(e) => dispatch(setDraftUpdatedTo(e.target.value))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>

            {isRecipeScope ? (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Recipe facets
                </Typography>
                <Stack spacing={2}>
                  <Autocomplete
                    options={cuisineOptions}
                    value={draftCuisine || null}
                    onChange={(_e, v) => setDraftCuisine(v ?? '')}
                    getOptionLabel={(opt) => opt}
                    renderOption={(props, option) => {
                      const count = cuisineCounts.get(option);
                      return (
                        <li {...props}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2">{option}</Typography>
                            {count != null ? (
                              <Typography variant="caption" color="text.secondary">
                                ({count})
                              </Typography>
                            ) : null}
                          </Stack>
                        </li>
                      );
                    }}
                    renderInput={(params) => <TextField {...params} label="Cuisine" />}
                    size="small"
                  />
                  <Autocomplete
                    multiple
                    options={categoryOptions}
                    value={draftCategories}
                    onChange={(_e, v) => setDraftCategories(v)}
                    getOptionLabel={(opt) => opt}
                    renderOption={(props, option) => {
                      const count = categoryCounts.get(option);
                      return (
                        <li {...props}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2">{option}</Typography>
                            {count != null ? (
                              <Typography variant="caption" color="text.secondary">
                                ({count})
                              </Typography>
                            ) : null}
                          </Stack>
                        </li>
                      );
                    }}
                    renderInput={(params) => <TextField {...params} label="Category" />}
                    size="small"
                  />
                  <Autocomplete
                    multiple
                    options={keywordOptions}
                    value={draftKeywords}
                    onChange={(_e, v) => setDraftKeywords(v)}
                    getOptionLabel={(opt) => opt}
                    renderOption={(props, option) => {
                      const count = keywordCounts.get(option);
                      return (
                        <li {...props}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2">{option}</Typography>
                            {count != null ? (
                              <Typography variant="caption" color="text.secondary">
                                ({count})
                              </Typography>
                            ) : null}
                          </Stack>
                        </li>
                      );
                    }}
                    renderInput={(params) => <TextField {...params} label="Keywords" />}
                    size="small"
                  />
                </Stack>
              </Box>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={clearDraftAndApply}>Clear</Button>
          <Button onClick={() => dispatch(setFiltersDialogOpen(false))}>Cancel</Button>
          <Button variant="contained" onClick={applyDraftFilters}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Save search</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g., Weeknight recipes"
              fullWidth
            />
            {saveErrorMessage ? <Alert severity="error">{saveErrorMessage}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveCurrentSearch}
            disabled={!saveName.trim() || createSavedSearchState.isLoading}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <SearchDebugPanel
        title="Search Debug"
        spec={requestSpec}
        request={requestForDebug}
        queryState={{
          isUninitialized,
          isLoading,
          isFetching,
          isSuccess,
          isError,
          error,
        }}
        response={data}
        explainEnabled={explainEnabled}
        explainDisabled={committed.mode !== 'hybrid'}
        onToggleExplain={setExplainEnabled}
      />
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
