import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Box,
  CircularProgress,
  Checkbox,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
  Alert,
  Chip,
  FormControlLabel,
  TextField,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SearchRequestV1 } from '@chatorama/chatalog-shared';
import { useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import { useSearchMutation } from './searchApi';

function useQueryParam(name: string): string {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search).get(name) ?? '', [search, name]);
}

function parseSlugParam(param: string): { id?: string; slug?: string } {
  const trimmed = param.trim();
  if (!trimmed) return {};
  const m = trimmed.match(/^([a-f0-9]{24})(?:-(.+))?$/i);
  if (m) {
    return { id: m[1], slug: m[2] };
  }
  return { slug: trimmed };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractHighlightTermsFromQ(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
}

function renderHighlighted(text: string, terms: string[]) {
  if (!text) return text;
  if (!terms.length) return text;

  const pattern = terms.map(escapeRegExp).join('|');
  if (!pattern) return text;

  const re = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(re);

  return parts.map((part, i) => {
    const isMatch = terms.some((t) => part.toLowerCase() === t.toLowerCase());
    return isMatch ? (
      <mark key={i} style={{ padding: 0, background: 'transparent', fontWeight: 700 }}>
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    );
  });
}

export function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const q = useQueryParam('q').trim();
  const subjectSlug = useQueryParam('subjectSlug').trim();
  const topicSlug = useQueryParam('topicSlug').trim();
  const statusParam = useQueryParam('status').trim();
  const tagsParam = useQueryParam('tags').trim();
  const importedOnlyParam = useQueryParam('importedOnly').trim();
  const updatedFromParam = useQueryParam('updatedFrom').trim();
  const updatedToParam = useQueryParam('updatedTo').trim();
  const createdFromParam = useQueryParam('createdFrom').trim();
  const createdToParam = useQueryParam('createdTo').trim();
  const sourceTypeParam = useQueryParam('sourceType').trim();
  const importBatchIdParam = useQueryParam('importBatchId').trim();
  const chatworthyChatIdParam = useQueryParam('chatworthyChatId').trim();

  const [runSearch, { data, isLoading, isError }] = useSearchMutation();
  const { data: subjectsWithTopics } = useGetSubjectsWithTopicsQuery();

  const { id: subjectIdFromSlug, slug: subjectSlugOnly } = parseSlugParam(subjectSlug);
  const { id: topicIdFromSlug, slug: topicSlugOnly } = parseSlugParam(topicSlug);

  const resolvedSubject = subjectSlug
    ? subjectsWithTopics?.find((s) =>
      subjectIdFromSlug ? s.id === subjectIdFromSlug : s.slug === subjectSlugOnly
    )
    : undefined;

  const resolvedTopic = topicSlug && resolvedSubject
    ? resolvedSubject.topics?.find((t) =>
      topicIdFromSlug ? t.id === topicIdFromSlug : t.slug === topicSlugOnly
    )
    : undefined;

  const resolvedSubjectId = resolvedSubject?.id;
  const resolvedTopicId = resolvedTopic?.id;

  const tagsAll = tagsParam
    ? tagsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const importedOnly =
    importedOnlyParam === '1' || importedOnlyParam.toLowerCase() === 'true';

  const highlightTerms = useMemo(() => extractHighlightTermsFromQ(q), [q]);

  const [statusInput, setStatusInput] = useState(statusParam);
  const [tagsInput, setTagsInput] = useState(tagsParam);
  const [importedOnlyInput, setImportedOnlyInput] = useState(importedOnly);
  const [updatedFromInput, setUpdatedFromInput] = useState(updatedFromParam);
  const [updatedToInput, setUpdatedToInput] = useState(updatedToParam);
  const [createdFromInput, setCreatedFromInput] = useState(createdFromParam);
  const [createdToInput, setCreatedToInput] = useState(createdToParam);
  const [sourceTypeInput, setSourceTypeInput] = useState(sourceTypeParam);
  const [importBatchIdInput, setImportBatchIdInput] = useState(importBatchIdParam);
  const [chatworthyChatIdInput, setChatworthyChatIdInput] = useState(chatworthyChatIdParam);

  useEffect(() => {
    setStatusInput(statusParam);
    setTagsInput(tagsParam);
    setImportedOnlyInput(importedOnly);
    setUpdatedFromInput(updatedFromParam);
    setUpdatedToInput(updatedToParam);
    setCreatedFromInput(createdFromParam);
    setCreatedToInput(createdToParam);
    setSourceTypeInput(sourceTypeParam);
    setImportBatchIdInput(importBatchIdParam);
    setChatworthyChatIdInput(chatworthyChatIdParam);
  }, [
    statusParam,
    tagsParam,
    importedOnly,
    updatedFromParam,
    updatedToParam,
    createdFromParam,
    createdToParam,
    sourceTypeParam,
    importBatchIdParam,
    chatworthyChatIdParam,
  ]);

  const scopeLabel = resolvedTopic
    ? `Topic: ${resolvedTopic.name}`
    : resolvedSubject
      ? `Subject: ${resolvedSubject.name}`
      : topicSlug
        ? `Topic: ${topicSlug}`
        : subjectSlug
          ? `Subject: ${subjectSlug}`
          : '';

  const clearScope = () => {
    const params = new URLSearchParams(location.search);
    params.delete('subjectSlug');
    params.delete('topicSlug');
    const next = params.toString();
    navigate(next ? `/search?${next}` : '/search');
  };

  const clearFilterParam = (key: string) => {
    const params = new URLSearchParams(location.search);
    params.delete(key);
    const next = params.toString();
    navigate(next ? `/search?${next}` : '/search');
  };

  const applyFilters = () => {
    const params = new URLSearchParams(location.search);
    const nextStatus = statusInput.trim();
    const nextTags = tagsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(',');
    const nextUpdatedFrom = updatedFromInput.trim();
    const nextUpdatedTo = updatedToInput.trim();
    const nextCreatedFrom = createdFromInput.trim();
    const nextCreatedTo = createdToInput.trim();
    const nextSourceType = sourceTypeInput.trim();
    const nextImportBatchId = importBatchIdInput.trim();
    const nextChatworthyChatId = chatworthyChatIdInput.trim();

    if (nextStatus) params.set('status', nextStatus);
    else params.delete('status');

    if (nextTags) params.set('tags', nextTags);
    else params.delete('tags');

    if (importedOnlyInput) params.set('importedOnly', '1');
    else params.delete('importedOnly');

    if (nextUpdatedFrom) params.set('updatedFrom', nextUpdatedFrom);
    else params.delete('updatedFrom');

    if (nextUpdatedTo) params.set('updatedTo', nextUpdatedTo);
    else params.delete('updatedTo');

    if (nextCreatedFrom) params.set('createdFrom', nextCreatedFrom);
    else params.delete('createdFrom');

    if (nextCreatedTo) params.set('createdTo', nextCreatedTo);
    else params.delete('createdTo');

    if (nextSourceType) params.set('sourceType', nextSourceType);
    else params.delete('sourceType');

    if (nextImportBatchId) params.set('importBatchId', nextImportBatchId);
    else params.delete('importBatchId');

    if (nextChatworthyChatId) params.set('chatworthyChatId', nextChatworthyChatId);
    else params.delete('chatworthyChatId');

    const next = params.toString();
    navigate(next ? `/search?${next}` : '/search');
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams(location.search);
    params.delete('status');
    params.delete('tags');
    params.delete('importedOnly');
    params.delete('updatedFrom');
    params.delete('updatedTo');
    params.delete('createdFrom');
    params.delete('createdTo');
    params.delete('sourceType');
    params.delete('importBatchId');
    params.delete('chatworthyChatId');
    const next = params.toString();
    navigate(next ? `/search?${next}` : '/search');
  };

  useEffect(() => {
    const filters: any = {
      ...(resolvedSubjectId ? { subjectId: resolvedSubjectId } : {}),
      ...(resolvedTopicId ? { topicId: resolvedTopicId } : {}),
      ...(statusParam ? { status: statusParam } : {}),
      ...(tagsAll.length ? { tagsAll } : {}),
      ...(importedOnly ? { importedOnly: true } : {}),
      ...(updatedFromParam ? { updatedAtFrom: updatedFromParam } : {}),
      ...(updatedToParam ? { updatedAtTo: updatedToParam } : {}),
      ...(createdFromParam ? { createdAtFrom: createdFromParam } : {}),
      ...(createdToParam ? { createdAtTo: createdToParam } : {}),
      ...(sourceTypeParam ? { sourceType: sourceTypeParam } : {}),
      ...(importBatchIdParam ? { importBatchId: importBatchIdParam } : {}),
      ...(chatworthyChatIdParam ? { chatworthyChatId: chatworthyChatIdParam } : {}),
    };

    // ✅ Allow filter-only searches:
    const hasAnyFilter = Object.keys(filters).length > 0;
    if (!q && !hasAnyFilter) return;

    const req: SearchRequestV1 = {
      version: 1,
      q, // may be ''
      targetTypes: ['note'],
      limit: 25,
      offset: 0,
      ...(hasAnyFilter ? { filters } : {}),
    };

    runSearch(req);
  }, [
    q,
    runSearch,
    resolvedSubjectId,
    resolvedTopicId,
    statusParam,
    tagsAll.join(','),
    importedOnly,
    updatedFromParam,
    updatedToParam,
    createdFromParam,
    createdToParam,
    sourceTypeParam,
    importBatchIdParam,
    chatworthyChatIdParam,
  ]);

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h5">Search</Typography>

        {!q && !(statusParam || tagsAll.length || importedOnly || updatedFromParam || updatedToParam || createdFromParam || createdToParam || sourceTypeParam || importBatchIdParam || chatworthyChatIdParam || subjectSlug || topicSlug) && (
          <Alert severity="info">Enter a search term or set filters.</Alert>
        )}

        {isLoading && (
          <Stack direction="row" spacing={2} alignItems="center">
            <CircularProgress size={20} />
            <Typography>Searching for "{q}"...</Typography>
          </Stack>
        )}

        {isError && <Alert severity="error">Search failed.</Alert>}

        {(subjectSlug || topicSlug) && (
          <Chip
            size="small"
            label={`Searching in: ${scopeLabel}`}
            onDelete={clearScope}
            sx={{ alignSelf: 'flex-start' }}
          />
        )}

        {(subjectSlug || topicSlug) && !resolvedSubject && (
          <Alert severity="warning">
            Could not resolve subject/topic scope; searching all notes.
          </Alert>
        )}

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Filters</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <TextField
                label="Status"
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value)}
                placeholder="e.g. UNREVIEWED"
              />
              <TextField
                label="Tags (comma-separated)"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="italian, pasta"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={importedOnlyInput}
                    onChange={(e) => setImportedOnlyInput(e.target.checked)}
                  />
                }
                label="Imported only"
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Updated from"
                  type="date"
                  value={updatedFromInput}
                  onChange={(e) => setUpdatedFromInput(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Updated to"
                  type="date"
                  value={updatedToInput}
                  onChange={(e) => setUpdatedToInput(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Created from"
                  type="date"
                  value={createdFromInput}
                  onChange={(e) => setCreatedFromInput(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Created to"
                  type="date"
                  value={createdToInput}
                  onChange={(e) => setCreatedToInput(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
              <TextField
                label="Source type"
                value={sourceTypeInput}
                onChange={(e) => setSourceTypeInput(e.target.value)}
                placeholder="chatworthy"
              />
              <TextField
                label="Import batch ID"
                value={importBatchIdInput}
                onChange={(e) => setImportBatchIdInput(e.target.value)}
                placeholder="batch id"
              />
              <TextField
                label="Chatworthy chat ID"
                value={chatworthyChatIdInput}
                onChange={(e) => setChatworthyChatIdInput(e.target.value)}
                placeholder="chat id"
              />
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={applyFilters}>
                  Apply
                </Button>
                <Button variant="outlined" onClick={clearAllFilters}>
                  Clear filters
                </Button>
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>

        {(statusParam ||
          tagsAll.length ||
          importedOnly ||
          updatedFromParam ||
          updatedToParam ||
          createdFromParam ||
          createdToParam ||
          sourceTypeParam ||
          importBatchIdParam ||
          chatworthyChatIdParam) && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {statusParam && (
                <Chip
                  size="small"
                  label={`Status: ${statusParam}`}
                  onDelete={() => clearFilterParam('status')}
                />
              )}
              {tagsAll.map((tag) => (
                <Chip
                  key={tag}
                  size="small"
                  label={`Tag: ${tag}`}
                  onDelete={() => {
                    const params = new URLSearchParams(location.search);
                    const nextTags = tagsAll.filter((t) => t !== tag).join(',');
                    if (nextTags) params.set('tags', nextTags);
                    else params.delete('tags');
                    const next = params.toString();
                    navigate(next ? `/search?${next}` : '/search');
                  }}
                />
              ))}
              {importedOnly && (
                <Chip
                  size="small"
                  label="Imported only"
                  onDelete={() => clearFilterParam('importedOnly')}
                />
              )}
              {updatedFromParam && (
                <Chip
                  size="small"
                  label={`Updated from: ${updatedFromParam}`}
                  onDelete={() => clearFilterParam('updatedFrom')}
                />
              )}
              {updatedToParam && (
                <Chip
                  size="small"
                  label={`Updated to: ${updatedToParam}`}
                  onDelete={() => clearFilterParam('updatedTo')}
                />
              )}
              {createdFromParam && (
                <Chip
                  size="small"
                  label={`Created from: ${createdFromParam}`}
                  onDelete={() => clearFilterParam('createdFrom')}
                />
              )}
              {createdToParam && (
                <Chip
                  size="small"
                  label={`Created to: ${createdToParam}`}
                  onDelete={() => clearFilterParam('createdTo')}
                />
              )}
              {sourceTypeParam && (
                <Chip
                  size="small"
                  label={`Source type: ${sourceTypeParam}`}
                  onDelete={() => clearFilterParam('sourceType')}
                />
              )}
              {importBatchIdParam && (
                <Chip
                  size="small"
                  label={`Import batch: ${importBatchIdParam}`}
                  onDelete={() => clearFilterParam('importBatchId')}
                />
              )}
              {chatworthyChatIdParam && (
                <Chip
                  size="small"
                  label={`Chatworthy chat: ${chatworthyChatIdParam}`}
                  onDelete={() => clearFilterParam('chatworthyChatId')}
                />
              )}
            </Stack>
          )}

        {data && (
          <>
            <Typography variant="body2" color="text.secondary">
              {(data.total ?? data.hits.length)} result{(data.total ?? data.hits.length) === 1 ? '' : 's'} for "{q}"
            </Typography>

            <List dense sx={{ maxHeight: 540, overflowY: 'auto' }}>
              {data.hits.map((h) => (
                <ListItemButton
                  key={h.id}
                  onClick={() => {
                    navigate(`/n/${h.id}`);
                  }}
                  alignItems="flex-start"
                >
                  <ListItemText
                    primary={renderHighlighted(h.title ?? '', highlightTerms)}
                    secondary={renderHighlighted(h.snippet ?? '', highlightTerms)}
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
      </Stack>
    </Box>
  );
}
