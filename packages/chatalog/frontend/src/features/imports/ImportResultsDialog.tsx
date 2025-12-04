// frontend/src/features/imports/ImportResultsDialog.tsx
import React, { useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import type { Note, Subject, Topic } from '@chatorama/chatalog-shared';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Box,
  Typography,
  Stack,
  Radio,
  FormControlLabel,
  LinearProgress,
  Tooltip,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import type { ImportedNoteSummary } from '../imports/importsApi';
import { subjectsApi, useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import { useGetNoteQuery } from '../notes/notesApi';

export type EditableImportedNoteRow = ImportedNoteSummary & {
  editedTitle: string;
  subjectLabel: string;
  topicLabel: string;
  showBody: boolean;
  // track whether user has manually changed subject/topic for this row
  subjectTouched: boolean;
  topicTouched: boolean;
  // whether this row should be imported when Apply is clicked
  selected: boolean;
};

type SubjectWithTopics = Subject & { topics?: Topic[] };

type Props = {
  open: boolean;
  onClose: () => void;
  importedNotes: ImportedNoteSummary[];
  combinedNote?: ImportedNoteSummary;
  subjects: SubjectWithTopics[];
  onApply: (rows: EditableImportedNoteRow[]) => void;
};

export function ImportResultsDialog({
  open,
  onClose,
  importedNotes,
  combinedNote,
  subjects,
  onApply,
}: Props) {
  type ViewMode = 'simple' | 'markdown' | 'full';
  const VIEW_MODE_STORAGE_KEY = 'chatalog.importResults.viewMode';
  const [importMode, setImportMode] = useState<'perTurn' | 'single'>('perTurn');
  const [selectedImportKey, setSelectedImportKey] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'imported' | 'existing'>('imported');
  const [selectedExistingNoteId, setSelectedExistingNoteId] = useState<string | null>(null);
  const PANEL_WIDTHS_STORAGE_KEY = 'chatalog.importResults.panelWidths';
  const DEFAULT_PANEL_WIDTHS: [number, number, number] = [0.45, 0.3, 0.25];
  const [panelWidths, setPanelWidths] = React.useState<[number, number, number]>(
    DEFAULT_PANEL_WIDTHS,
  );
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>('full');

  const [defaultSubjectLabel, setDefaultSubjectLabel] = useState('');
  const [defaultTopicLabel, setDefaultTopicLabel] = useState('');
  const subjectBulkUpdateRef = React.useRef(false);
  const topicBulkUpdateRef = React.useRef(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const buildEditableRows = (notes: ImportedNoteSummary[]) =>
    notes.map((n) => ({
      ...n,
      editedTitle: n.title,
      subjectLabel: n.subjectName ?? '',
      topicLabel: n.topicName ?? '',
      showBody: false,
      subjectTouched: false,
      topicTouched: false,
      selected: true, // default: include all notes initially
    }));

  const [rows, setRows] = useState<EditableImportedNoteRow[]>(() =>
    buildEditableRows(importedNotes),
  );

  const [singleRows, setSingleRows] = useState<EditableImportedNoteRow[]>(() =>
    combinedNote ? buildEditableRows([combinedNote]) : [],
  );

  // Initialize defaults + rows whenever a new import result comes in
  React.useEffect(() => {
    if (!importedNotes.length) return;

    const firstSubject =
      importedNotes.find((n) => n.subjectName)?.subjectName ??
      combinedNote?.subjectName ??
      '';
    const firstTopic =
      importedNotes.find((n) => n.topicName)?.topicName ??
      combinedNote?.topicName ??
      '';

    setDefaultSubjectLabel(firstSubject);
    setDefaultTopicLabel(firstTopic);

    setRows(
      importedNotes.map((n) => ({
        ...n,
        editedTitle: n.title,
        // keep the importer’s initial guess, but mark as not touched
        subjectLabel: n.subjectName ?? firstSubject ?? '',
        topicLabel: n.topicName ?? firstTopic ?? '',
        showBody: false,
        subjectTouched: false,
        topicTouched: false,
        selected: true,
      })),
    );

    setSingleRows(
      combinedNote
        ? [
          {
            ...combinedNote,
            editedTitle: combinedNote.title,
            subjectLabel: combinedNote.subjectName ?? firstSubject ?? '',
            topicLabel: combinedNote.topicName ?? firstTopic ?? '',
            showBody: false,
            subjectTouched: false,
            topicTouched: false,
            selected: true,
          },
        ]
        : [],
    );
  }, [importedNotes, combinedNote]);

  // clear bulk flags after rows change
  React.useEffect(() => {
    subjectBulkUpdateRef.current = false;
    topicBulkUpdateRef.current = false;
  }, [rows, singleRows]);

  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = window.localStorage.getItem(PANEL_WIDTHS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as [number, number, number];
      if (
        Array.isArray(parsed) &&
        parsed.length === 3 &&
        parsed.every((v) => typeof v === 'number' && v > 0 && v < 1)
      ) {
        const sum = parsed[0] + parsed[1] + parsed[2];
        if (sum > 0.99 && sum < 1.01) {
          setPanelWidths(parsed);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [open, PANEL_WIDTHS_STORAGE_KEY]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(
        PANEL_WIDTHS_STORAGE_KEY,
        JSON.stringify(panelWidths),
      );
    } catch {
      // ignore storage failures
    }
  }, [panelWidths, PANEL_WIDTHS_STORAGE_KEY]);

  const activeRows = useMemo(
    () => (importMode === 'perTurn' ? rows : singleRows),
    [importMode, rows, singleRows],
  );

  React.useEffect(() => {
    const candidate = (activeRows.length ? activeRows : rows)[0];
    if (candidate) {
      setSelectedImportKey(candidate.importKey);
    } else {
      setSelectedImportKey(null);
    }
    setPreviewMode('imported');
  }, [activeRows, rows]);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();

    if (defaultSubjectLabel?.trim()) set.add(defaultSubjectLabel.trim());

    importedNotes
      .map((n) => n.subjectName?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));

    activeRows
      .map((r) => r.subjectLabel?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));

    subjects
      .map((s) => s.name?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));

    return Array.from(set);
  }, [defaultSubjectLabel, importedNotes, activeRows, subjects]);

  const topicOptionsForSubject = (subjectLabel: string, currentTopicLabel: string) => {
    const trimmedSubject = subjectLabel.trim();
    const trimmedTopic = currentTopicLabel.trim();

    const subject = subjects.find(
      (s) => s.name?.trim() === trimmedSubject,
    ) as SubjectWithTopics | undefined;

    const set = new Set<string>();

    (subject?.topics ?? []).forEach((t) => {
      const name = t.name?.trim();
      if (name) set.add(name);
    });

    if (trimmedTopic) set.add(trimmedTopic);

    return Array.from(set);
  };

  const handleRowChange = (
    importKey: string,
    patch: Partial<EditableImportedNoteRow>,
  ) => {
    const setter = importMode === 'perTurn' ? setRows : setSingleRows;
    setter((prev) => prev.map((r) => (r.importKey === importKey ? { ...r, ...patch } : r)));
  };

  const updateDefaultSubject = (next: string) => {
    setDefaultSubjectLabel(next);
    subjectBulkUpdateRef.current = true;
    const setter = importMode === 'perTurn' ? setRows : setSingleRows;
    setter((prevRows) =>
      prevRows.map((r) =>
        r.subjectTouched
          ? r
          : {
              ...r,
              subjectLabel: next ?? '',
            },
      ),
    );
  };

  const updateDefaultTopic = (next: string) => {
    setDefaultTopicLabel(next);
    topicBulkUpdateRef.current = true;
    const setter = importMode === 'perTurn' ? setRows : setSingleRows;
    setter((prevRows) =>
      prevRows.map((r) =>
        r.topicTouched
          ? r
          : {
              ...r,
              topicLabel: next ?? '',
            },
      ),
    );
  };

  const handleApply = () => {
    const base = importMode === 'perTurn' ? rows : singleRows.length ? singleRows : rows;
    const payload = base.filter((r) => r.selected);
    onApply(payload);
  };

  const { data: subjectsWithTopics = [], isLoading: isLoadingSubjects } =
    useGetSubjectsWithTopicsQuery();

  const [topicNotesMap, setTopicNotesMap] = useState<Record<string, Note[]>>({});
  const [loadingTopicNotes, setLoadingTopicNotes] = useState<Record<string, boolean>>({});
  const [topicErrors, setTopicErrors] = useState<Record<string, string>>({});
  const [fetchTopicNotes] = subjectsApi.useLazyGetNotePreviewsForTopicQuery();

  const ensureTopicNotes = React.useCallback(
    async (subjectId: string, topicId: string) => {
      if (topicNotesMap[topicId] || loadingTopicNotes[topicId]) return;
      setLoadingTopicNotes((prev) => ({ ...prev, [topicId]: true }));
      try {
        const data = await fetchTopicNotes({ subjectId, topicId }).unwrap();
        setTopicNotesMap((prev) => ({ ...prev, [topicId]: data ?? [] }));
      } catch (err) {
        setTopicErrors((prev) => ({ ...prev, [topicId]: 'Failed to load notes' }));
      } finally {
        setLoadingTopicNotes((prev) => ({ ...prev, [topicId]: false }));
      }
    },
    [fetchTopicNotes, loadingTopicNotes, topicNotesMap],
  );

  // Eagerly load notes for all topics when subjectsWithTopics changes
  React.useEffect(() => {
    if (!subjectsWithTopics.length) return;

    subjectsWithTopics.forEach((subject) => {
      (subject.topics ?? []).forEach((topic) => {
        void ensureTopicNotes(subject.id, topic.id);
      });
    });
  }, [subjectsWithTopics, ensureTopicNotes]);

  const { data: existingNote, isFetching: isFetchingExistingNote } = useGetNoteQuery(
    previewMode === 'existing' && selectedExistingNoteId ? selectedExistingNoteId : skipToken,
  );

  const selectedRow =
    (activeRows.length ? activeRows : rows).find((r) => r.importKey === selectedImportKey) ?? null;

  const panelHeight = '70vh';
  const panelSx = {
    maxHeight: panelHeight,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  } as const;

  type DividerIndex = 0 | 1;
  const MIN_PANEL_FRACTION = 0.15;

  const [dragState, setDragState] = React.useState<{
    active: boolean;
    dividerIndex: DividerIndex | null;
    startX: number;
    startWidths: [number, number, number];
  }>({
    active: false,
    dividerIndex: null,
    startX: 0,
    startWidths: DEFAULT_PANEL_WIDTHS,
  });

  const handleDividerMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
    dividerIndex: DividerIndex,
  ) => {
    if (!containerRef.current) return;
    event.preventDefault();
    setDragState({
      active: true,
      dividerIndex,
      startX: event.clientX,
      startWidths: panelWidths,
    });
  };

  const handleWindowMouseMove = React.useCallback(
    (event: MouseEvent) => {
      if (!dragState.active || dragState.dividerIndex === null || !containerRef.current) {
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const totalWidth = containerRect.width || 1;
      const deltaX = event.clientX - dragState.startX;
      const deltaFraction = deltaX / totalWidth;

      const [w0, w1, w2] = dragState.startWidths;
      let newWidths: [number, number, number] = [w0, w1, w2];

      if (dragState.dividerIndex === 0) {
        let left = w0 + deltaFraction;
        let middle = w1 - deltaFraction;

        left = Math.max(MIN_PANEL_FRACTION, Math.min(left, 1 - MIN_PANEL_FRACTION * 2));
        middle = Math.max(MIN_PANEL_FRACTION, Math.min(middle, 1 - MIN_PANEL_FRACTION * 2));

        const right = 1 - left - middle;
        if (right >= MIN_PANEL_FRACTION) {
          newWidths = [left, middle, right];
        }
      } else if (dragState.dividerIndex === 1) {
        let middle = w1 + deltaFraction;
        let right = w2 - deltaFraction;

        middle = Math.max(MIN_PANEL_FRACTION, Math.min(middle, 1 - MIN_PANEL_FRACTION * 2));
        right = Math.max(MIN_PANEL_FRACTION, Math.min(right, 1 - MIN_PANEL_FRACTION * 2));

        const left = 1 - middle - right;
        if (left >= MIN_PANEL_FRACTION) {
          newWidths = [left, middle, right];
        }
      }

      setPanelWidths(newWidths);
    },
    [dragState, setPanelWidths],
  );

  const handleWindowMouseUp = React.useCallback(() => {
    if (dragState.active) {
      setDragState((prev) => ({ ...prev, active: false, dividerIndex: null }));
    }
  }, [dragState.active]);

  React.useEffect(() => {
    if (!dragState.active) return;

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [dragState.active, handleWindowMouseMove, handleWindowMouseUp]);

  const handleViewModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    next: ViewMode | null,
  ) => {
    if (!next) return;
    setViewMode(next);
  };

  React.useEffect(() => {
    if (!open) return;
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) as ViewMode | null;
      if (stored === 'simple' || stored === 'markdown' || stored === 'full') {
        setViewMode(stored);
      } else {
        setViewMode('full');
      }
    } catch {
      setViewMode('full');
    }
  }, [open, VIEW_MODE_STORAGE_KEY]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // ignore storage failures
    }
  }, [viewMode, VIEW_MODE_STORAGE_KEY]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      PaperProps={{
        sx: {
          width: '95vw',
          maxWidth: 1700,
        },
      }}
    >
      <DialogTitle>Review Imported Notes</DialogTitle>
      <DialogContent dividers sx={{ p: 2 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Layout:
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={viewMode}
            onChange={handleViewModeChange}
          >
            <ToggleButton value="simple">Simple</ToggleButton>
            <ToggleButton value="markdown">Markdown</ToggleButton>
            <ToggleButton value="full">Full</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box
          ref={containerRef}
          sx={{
            display: 'flex',
            gap: 0,
            alignItems: 'stretch',
            minHeight: 0,
            width: '100%',
          }}
        >
          {/* Left: existing import UI */}
          <Box
            sx={{
              ...panelSx,
              ...(viewMode === 'full'
                ? {
                    flex: '0 0 auto',
                    flexBasis: `${panelWidths[0] * 100}%`,
                    pr: 1,
                  }
                : {
                    flex: 1,
                    pr: viewMode === 'markdown' ? 1 : 0,
                  }),
            }}
          >
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                How would you like to import this file?
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                <FormControlLabel
                  control={
                    <Radio
                      checked={importMode === 'perTurn'}
                      onChange={() => setImportMode('perTurn')}
                    />
                  }
                  label="One note per turn"
                />
                <FormControlLabel
                  control={
                    <Radio
                      checked={importMode === 'single'}
                      onChange={() => setImportMode('single')}
                      disabled={!combinedNote}
                    />
                  }
                  label="Single note for entire conversation"
                />
              </Stack>
            </Box>

            <Typography variant="body2" sx={{ mb: 2 }}>
              Set default Subject/Topic labels below, then tweak each note as needed.
              You can either pick from the list or type new labels. Changing a
              default updates any rows whose Subject/Topic you haven&apos;t manually
              edited yet. Select a row to see the full note body in the preview panel.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              <Autocomplete
                freeSolo
                options={subjectOptions}
                value={defaultSubjectLabel}
                onInputChange={(_e, newInputValue) =>
                  updateDefaultSubject(newInputValue ?? '')
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Default Subject label"
                    size="small"
                    sx={{ minWidth: 220 }}
                  />
                )}
              />

              <Autocomplete
                freeSolo
                options={topicOptionsForSubject(defaultSubjectLabel, defaultTopicLabel)}
                value={defaultTopicLabel}
                onInputChange={(_e, newInputValue) =>
                  updateDefaultTopic(newInputValue ?? '')
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Default Topic label"
                    size="small"
                    sx={{ minWidth: 220 }}
                  />
                )}
              />
            </Box>

            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Title</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Topic</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(activeRows.length ? activeRows : rows).map((row) => (
                  <TableRow
                    key={row.importKey}
                    hover
                    selected={selectedImportKey === row.importKey}
                    onClick={() => {
                      setSelectedImportKey(row.importKey);
                      setPreviewMode('imported');
                    }}
                    sx={{
                      cursor: 'pointer',
                      '&.Mui-selected': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={row.selected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleRowChange(row.importKey, { selected: e.target.checked })
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 240 }}>
                      <TextField
                        fullWidth
                        size="small"
                        value={row.editedTitle}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleRowChange(row.importKey, {
                            editedTitle: e.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Autocomplete
                        freeSolo
                        options={subjectOptions}
                        value={row.subjectLabel}
                        onChange={(_e, newValue) => {
                          if (subjectBulkUpdateRef.current) return;
                          handleRowChange(row.importKey, {
                            subjectLabel: newValue ?? '',
                            subjectTouched: true,
                          });
                        }}
                        onInputChange={(_e, newInputValue) => {
                          if (subjectBulkUpdateRef.current) return;
                          handleRowChange(row.importKey, {
                            subjectLabel: newInputValue ?? '',
                            subjectTouched: true,
                          });
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Subject"
                            size="small"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <Autocomplete
                        freeSolo
                        options={topicOptionsForSubject(row.subjectLabel, row.topicLabel)}
                        value={row.topicLabel}
                        onChange={(_e, newValue) => {
                          if (topicBulkUpdateRef.current) return;
                          handleRowChange(row.importKey, {
                            topicLabel: newValue ?? '',
                            topicTouched: true,
                          });
                        }}
                        onInputChange={(_e, newInputValue) => {
                          if (topicBulkUpdateRef.current) return;
                          handleRowChange(row.importKey, {
                            topicLabel: newInputValue ?? '',
                            topicTouched: true,
                          });
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Topic"
                            size="small"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          {/* Divider between left and middle – only in Full mode */}
          {viewMode === 'full' && (
            <Box
              onMouseDown={(e) => handleDividerMouseDown(e, 0)}
              sx={{
                width: 10,
                cursor: 'col-resize',
                flexShrink: 0,
                alignSelf: 'stretch',
                bgcolor: 'divider',
                opacity: 0.6,
                transition: 'opacity 120ms ease',
                '&:hover': { opacity: 1 },
                '&:active': { opacity: 1 },
              }}
            />
          )}

          {/* Middle: hierarchy */}
          <Box
            sx={{
              ...panelSx,
              ...(viewMode === 'full'
                ? {
                    flex: '0 0 auto',
                    flexBasis: `${panelWidths[1] * 100}%`,
                    px: 1,
                  }
                : {
                    display: 'none',
                  }),
            }}
          >
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Existing Hierarchy
            </Typography>
            {isLoadingSubjects ? (
              <LinearProgress />
            ) : subjectsWithTopics.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No subjects yet.
              </Typography>
            ) : (
              <SimpleTreeView
                expandedItems={expandedItems}
                expansionTrigger="iconContainer"
                onExpandedItemsChange={(_event, itemIds) => {
                  setExpandedItems(itemIds);
                  itemIds.forEach((id) => {
                    if (id.startsWith('topic:')) {
                      const topicId = id.replace('topic:', '');
                      const subject = subjectsWithTopics.find((s) =>
                        s.topics?.some((t) => t.id === topicId),
                      );
                      const topic = subject?.topics?.find((t) => t.id === topicId);
                      if (subject && topic) {
                        void ensureTopicNotes(subject.id, topic.id);
                      }
                    }
                  });
                }}
                onItemClick={(_event, itemId) => {
                  if (itemId.startsWith('note:')) {
                    const noteId = itemId.replace('note:', '');
                    setSelectedExistingNoteId(noteId);
                    setPreviewMode('existing');
                  }
                }}
              >
                {subjectsWithTopics.map((s) => (
                  <TreeItem key={s.id} itemId={`subject:${s.id}`} label={s.name}>
                    {(s.topics ?? []).map((t) => {
                      const notes = topicNotesMap[t.id] || [];
                      const isLoading = loadingTopicNotes[t.id];
                      const topicError = topicErrors[t.id];

                      return (
                        <TreeItem key={t.id} itemId={`topic:${t.id}`} label={t.name}>
                          {isLoading && (
                            <TreeItem
                              itemId={`topic-loading:${t.id}`}
                              label="Loading notes…"
                            />
                          )}
                          {topicError && (
                            <TreeItem
                              itemId={`topic-error:${t.id}`}
                              label={`Error: ${topicError}`}
                            />
                          )}
                          {notes.map((n) => {
                            // Prefer summary, fall back to markdown if present
                            const rawSummary = (n as any).summary as string | undefined;
                            const rawMarkdown = (n as any).markdown as string | undefined;
                            const baseText =
                              rawSummary && rawSummary.trim().length > 0
                                ? rawSummary
                                : rawMarkdown || '';

                            const snippet =
                              baseText.length > 0 ? baseText.slice(0, 160) : '';

                            const handleNoteClick: React.MouseEventHandler<HTMLSpanElement> = (
                              event,
                            ) => {
                              event.stopPropagation();
                              setSelectedExistingNoteId(n.id);
                              setPreviewMode('existing');
                            };

                            return (
                              <TreeItem
                                key={n.id}
                                itemId={`note:${n.id}`}
                                label={
                                  snippet ? (
                                    <Tooltip title={snippet} arrow placement="right">
                                      <span
                                        onClick={handleNoteClick}
                                        style={{ cursor: 'pointer' }}
                                      >
                                        {n.title || 'Untitled note'}
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    <span
                                      onClick={handleNoteClick}
                                      style={{ cursor: 'pointer' }}
                                    >
                                      {n.title || 'Untitled note'}
                                    </span>
                                  )
                                }
                              />
                            );
                          })}
                        </TreeItem>
                      );
                    })}
                  </TreeItem>
                ))}
              </SimpleTreeView>
            )}
          </Box>

          {/* Divider between middle and right – only in Full mode */}
          {viewMode === 'full' && (
            <Box
              onMouseDown={(e) => handleDividerMouseDown(e, 1)}
              sx={{
                width: 10,
                cursor: 'col-resize',
                flexShrink: 0,
                alignSelf: 'stretch',
                bgcolor: 'divider',
                opacity: 0.6,
                transition: 'opacity 120ms ease',
                '&:hover': { opacity: 1 },
                '&:active': { opacity: 1 },
              }}
            />
          )}

          {/* Right: preview */}
          <Box
            sx={{
              ...panelSx,
              ...(viewMode === 'full'
                ? {
                    flex: '0 0 auto',
                    flexBasis: `${panelWidths[2] * 100}%`,
                    pl: 1,
                  }
                : viewMode === 'markdown'
                ? {
                    flex: 1,
                    pl: 1,
                  }
                : {
                    display: 'none',
                  }),
            }}
          >
            {previewMode === 'existing' && selectedExistingNoteId ? (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    Viewing existing note
                  </Typography>
                  <Button size="small" onClick={() => setPreviewMode('imported')}>
                    Return to imported note preview
                  </Button>
                </Box>
                {isFetchingExistingNote && (
                  <Typography variant="body2" color="text.secondary">
                    Loading note…
                  </Typography>
                )}
                {existingNote && (
                  <>
                    <Typography variant="h6">
                      {existingNote.title || 'Untitled note'}
                    </Typography>
                    <Box sx={{ mt: 2 }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {existingNote.markdown}
                      </ReactMarkdown>
                    </Box>
                  </>
                )}
              </>
            ) : selectedRow ? (
              <>
                <Typography variant="h6">
                  {selectedRow.title || 'Untitled imported note'}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {selectedRow.body}
                  </ReactMarkdown>
                </Box>
              </>
            ) : (
              <>
                <Typography variant="subtitle1">Preview</Typography>
                <Typography variant="body2" color="text.secondary">
                  Select an imported row to see its content here.
                </Typography>
              </>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleApply}>
          Apply Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
