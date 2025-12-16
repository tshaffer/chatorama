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
  Alert,
  IconButton,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import type { ImportedNoteSummary } from '../imports/importsApi';
import { subjectsApi, useGetSubjectsWithTopicsQuery } from '../subjects/subjectsApi';
import { useGetNoteQuery } from '../notes/notesApi';
import MarkdownBody from '../../components/MarkdownBody';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type {
  DuplicateStatus,
  DuplicateDecision,
  ApplyNoteImportCommand,
} from '@chatorama/chatalog-shared';

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

interface NoteDuplicateResolution {
  noteId: string;
  decision: DuplicateDecision;
  turnActions: {
    [turnIndex: number]: 'useImported' | 'useExisting';
  };
}

type SubjectWithTopics = Subject & { topics?: Topic[] };

type Props = {
  open: boolean;
  onClose: () => void;
  importedNotes: ImportedNoteSummary[];
  combinedNote?: ImportedNoteSummary;
  subjects: SubjectWithTopics[];
  onApply: (rows: EditableImportedNoteRow[], commands: ApplyNoteImportCommand[]) => void;
  hasDuplicateTurns?: boolean;
  duplicateTurnCount?: number;
};

export function ImportResultsDialog({
  open,
  onClose,
  importedNotes,
  combinedNote,
  subjects,
  onApply,
  hasDuplicateTurns = false,
  duplicateTurnCount = 0,
}: Props) {
  type ViewMode = 'simple' | 'markdown' | 'full';
  const VIEW_MODE_STORAGE_KEY = 'chatalog.importResults.viewMode';
  const isSingleTurnImport = importedNotes.length === 1;
  const [importMode, setImportMode] = useState<'perTurn' | 'single'>('perTurn');
  const [selectedImportKey, setSelectedImportKey] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'imported' | 'existing'>('imported');
  const [selectedExistingNoteId, setSelectedExistingNoteId] = useState<string | null>(null);
  const PANEL_WIDTHS_STORAGE_KEY = 'chatalog.importResults.panelWidths';
  const DEFAULT_PANEL_WIDTHS: [number, number, number] = [0.45, 0.3, 0.25];
  const [panelWidths, setPanelWidths] = React.useState<[number, number, number]>(
    DEFAULT_PANEL_WIDTHS,
  );
  const MARKDOWN_SPLIT_STORAGE_KEY = 'chatalog.importResults.markdownSplitLeft';
  const DEFAULT_MARKDOWN_SPLIT_LEFT = 0.55; // left fraction
  const [markdownSplitLeft, setMarkdownSplitLeft] = React.useState<number>(DEFAULT_MARKDOWN_SPLIT_LEFT);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>('full');

  const [defaultSubjectLabel, setDefaultSubjectLabel] = useState('');
  const [defaultTopicLabel, setDefaultTopicLabel] = useState('');
  const subjectBulkUpdateRef = React.useRef(false);
  const topicBulkUpdateRef = React.useRef(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const hasDuplicatesForRow = (n: ImportedNoteSummary) =>
    n.duplicateStatus !== 'none' && (n.duplicateCount ?? 0) > 0;

  const buildEditableRows = (notes: ImportedNoteSummary[]) =>
    notes.map((n) => ({
      ...n,
      editedTitle: n.title,
      subjectLabel: n.subjectName ?? '',
      topicLabel: n.topicName ?? '',
      showBody: false,
      subjectTouched: false,
      topicTouched: false,
      // default: include only notes without duplicate turns
      selected: !hasDuplicatesForRow(n),
    }));

  const [rows, setRows] = useState<EditableImportedNoteRow[]>(() =>
    buildEditableRows(importedNotes),
  );

  const [singleRows, setSingleRows] = useState<EditableImportedNoteRow[]>(() =>
    combinedNote ? buildEditableRows([combinedNote]) : [],
  );

  const [duplicateResolutions, setDuplicateResolutions] = useState<
    Record<string, NoteDuplicateResolution>
  >({});

  const setNoteDecision = (noteId: string, decision: DuplicateDecision) => {
    setDuplicateResolutions((prev) => ({
      ...prev,
      [noteId]: {
        noteId,
        decision,
        turnActions: prev[noteId]?.turnActions ?? {},
      },
    }));
  };

  const setTurnAction = (noteId: string, turnIndex: number, action: 'useImported' | 'useExisting') => {
    setDuplicateResolutions((prev) => {
      const existing = prev[noteId] ?? { noteId, decision: 'keepAsNew' as DuplicateDecision, turnActions: {} };
      return {
        ...prev,
        [noteId]: {
          ...existing,
          turnActions: {
            ...existing.turnActions,
            [turnIndex]: action,
          },
        },
      };
    });
  };

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
        selected: !hasDuplicatesForRow(n),
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
            selected: !hasDuplicatesForRow(combinedNote),
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
      const raw = window.localStorage.getItem(MARKDOWN_SPLIT_STORAGE_KEY);
      if (!raw) return;
      const v = Number(raw);
      if (Number.isFinite(v) && v > 0.1 && v < 0.9) setMarkdownSplitLeft(v);
    } catch {
      // ignore
    }
  }, [open]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(MARKDOWN_SPLIT_STORAGE_KEY, String(markdownSplitLeft));
    } catch {
      // ignore
    }
  }, [markdownSplitLeft]);

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
    const commands: ApplyNoteImportCommand[] = base.map((r) => {
      const resolution = duplicateResolutions[r.importKey];
      const hasDuplicates = r.duplicateStatus !== 'none' && r.duplicateCount > 0;
      const decision: DuplicateDecision | undefined = hasDuplicates
        ? resolution?.decision ?? 'keepAsNew'
        : undefined;
      const turnActions =
        decision === 'replace' ? resolution?.turnActions : undefined;

      return {
        importedNoteId: r.importKey,
        include: r.selected,
        duplicateDecision: decision,
        turnActions,
      };
    });
    onApply(base, commands);
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

  const panelSx = {
    flex: '1 1 auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  } as const;

  const renderLeftPanelContent = () => (
    <>
      <Box sx={{ flex: '0 0 auto' }}>
        {!isSingleTurnImport && (
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
        )}

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
      </Box>

      <Box
        sx={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          pr: 1,
        }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell
                sx={{
                  width: '40%',
                  minWidth: 260,
                }}
              >
                Title
              </TableCell>
              <TableCell
                align="center"
                sx={{
                  width: 80,
                  maxWidth: 90,
                  whiteSpace: 'nowrap',
                }}
              >
                Dupes
              </TableCell>
              <TableCell
                align="center"
                sx={{
                  width: hasAnyDuplicates ? 200 : 120,
                  maxWidth: hasAnyDuplicates ? 220 : 140,
                  whiteSpace: 'nowrap',
                }}
              >
                Decision
              </TableCell>
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
                <TableCell
                  sx={{
                    width: '40%',
                    minWidth: 260,
                  }}
                >
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
                <TableCell
                  align="center"
                  sx={{
                    width: 80,
                    maxWidth: 90,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(() => {
                    const status = row.duplicateStatus as DuplicateStatus;
                    const count = row.duplicateCount ?? 0;
                    const conflicts = row.conflicts ?? [];
                    let IconComp: typeof CheckCircleOutlineIcon | typeof WarningAmberIcon | typeof ErrorOutlineIcon =
                      CheckCircleOutlineIcon;
                    let color: 'success' | 'warning' | 'error' = 'success';
                    let label = 'No duplicate turns detected';
                    if (status === 'partial') {
                      IconComp = WarningAmberIcon;
                      color = 'warning';
                      label = `${count} duplicate turn${count === 1 ? '' : 's'} detected`;
                    } else if (status === 'full') {
                      IconComp = ErrorOutlineIcon;
                      color = 'error';
                      label = `All turns (${count}) are duplicates`;
                    }
                    return (
                      <Tooltip
                        title={
                          <Box>
                            <div>{label}</div>
                            {conflicts.slice(0, 3).map((c, idx) => (
                              <div key={idx}>
                                {[c.existingSubjectName, c.existingTopicName, c.existingNoteTitle]
                                  .filter(Boolean)
                                  .join(' / ')}
                              </div>
                            ))}
                            {conflicts.length > 3 && <div>…</div>}
                          </Box>
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImportKey(row.importKey);
                            setPreviewMode('imported');
                          }}
                        >
                          <IconComp color={color} fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    );
                  })()}
                </TableCell>
                <TableCell
                  align="center"
                  sx={{
                    width: hasAnyDuplicates ? 200 : 120,
                    maxWidth: hasAnyDuplicates ? 220 : 140,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.selected && row.duplicateStatus !== 'none' && (
                    <ToggleButtonGroup
                      size="small"
                      value={duplicateResolutions[row.importKey]?.decision ?? 'keepAsNew'}
                      exclusive
                      onChange={(_e, value: DuplicateDecision | null) => {
                        if (!value) return;
                        setNoteDecision(row.importKey, value);
                      }}
                    >
                      <ToggleButton value="keepAsNew">Keep as new</ToggleButton>
                      <ToggleButton value="replace">Replace existing</ToggleButton>
                    </ToggleButtonGroup>
                  )}
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
    </>
  );

  const renderMiddlePanelContent = () => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Typography
        variant="subtitle2"
        color="text.secondary"
        sx={{
          mb: 1,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar - 1,
          bgcolor: 'background.paper',
          pt: 1,
        }}
      >
        Existing hierarchy
      </Typography>

      <Box sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', pr: 1 }}>
        {isLoadingSubjects ? (
          <LinearProgress />
        ) : subjectsWithTopics.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No subjects yet.
          </Typography>
        ) : (
          <SimpleTreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={(_event, itemIds) => {
              setExpandedItems(itemIds);
              itemIds
                .filter((id) => id.startsWith('topic-'))
                .forEach((topicItemId) => {
                  const topicId = topicItemId.replace('topic-', '');
                  const parentSubject = subjectsWithTopics.find((s) =>
                    (s.topics ?? []).some((t) => t.id === topicId),
                  );
                  if (parentSubject) {
                    void ensureTopicNotes(parentSubject.id, topicId);
                  }
                });
            }}
            selectedItems={
              previewMode === 'existing' && selectedExistingNoteId
                ? `note-${selectedExistingNoteId}`
                : undefined
            }
          >
            {subjectsWithTopics.map((subject) => (
              <TreeItem key={subject.id} itemId={`subject-${subject.id}`} label={subject.name}>
                {(subject.topics ?? []).map((topic) => {
                  const notes = topicNotesMap[topic.id] ?? [];
                  const loading = loadingTopicNotes[topic.id];
                  const error = topicErrors[topic.id];
                  return (
                    <TreeItem key={topic.id} itemId={`topic-${topic.id}`} label={topic.name}>
                      {loading && (
                        <TreeItem
                          itemId={`topic-${topic.id}-loading`}
                          label={
                            <Typography variant="body2" color="text.secondary">
                              Loading notes…
                            </Typography>
                          }
                        />
                      )}
                      {error && (
                        <TreeItem
                          itemId={`topic-${topic.id}-error`}
                          label={
                            <Typography variant="body2" color="error">
                              {error}
                            </Typography>
                          }
                        />
                      )}
                      {!loading && !error && notes.length === 0 && (
                        <TreeItem
                          itemId={`topic-${topic.id}-empty`}
                          label={
                            <Typography variant="body2" color="text.secondary">
                              No notes
                            </Typography>
                          }
                        />
                      )}
                      {notes.map((note) => (
                        <TreeItem
                          key={note.id}
                          itemId={`note-${note.id}`}
                          label={
                            <Box
                              sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedExistingNoteId(note.id);
                                setPreviewMode('existing');
                              }}
                            >
                              {note.title || 'Untitled note'}
                            </Box>
                          }
                        />
                      ))}
                    </TreeItem>
                  );
                })}
              </TreeItem>
            ))}
          </SimpleTreeView>
        )}
      </Box>
    </Box>
  );

  const renderRightPanelContent = () => (
    <>
      <Box sx={{ flex: '0 0 auto' }}>
        {previewMode === 'existing' && selectedExistingNoteId ? (
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
        ) : selectedRow ? (
          <Typography variant="h6">
            {selectedRow.title || 'Untitled imported note'}
          </Typography>
        ) : (
          <Typography variant="subtitle1">Preview</Typography>
        )}
      </Box>
      <Box sx={{ flex: '1 1 auto', minHeight: 0, pr: 2 }}>
        <Box
          sx={{
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            pr: 1,
            '&::-webkit-scrollbar': { width: 12 },
            '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 8 },
            '&::-webkit-scrollbar-track': { backgroundColor: 'rgba(0,0,0,0.08)' },
          }}
        >
          {previewMode === 'existing' && selectedExistingNoteId ? (
            <>
              {isFetchingExistingNote && (
                <Typography variant="body2" color="text.secondary">
                  Loading note…
                </Typography>
              )}
              {existingNote && (
                <>
                  <Typography variant="h6" sx={{ mt: 1 }}>
                    {existingNote.title || 'Untitled note'}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    <MarkdownBody markdown={existingNote.markdown} />
                  </Box>
                </>
              )}
            </>
          ) : selectedRow ? (
            <>
              <Box sx={{ mt: 2 }}>
                <MarkdownBody markdown={selectedRow.body} />
              </Box>
              {selectedRow.duplicateStatus !== 'none' && selectedRow.conflicts?.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Turn Conflicts
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    These turns in the imported note also appear in existing notes. Choose what to do per turn.
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Turn</TableCell>
                        <TableCell>Existing Note</TableCell>
                        <TableCell>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {selectedRow.conflicts.map((conflict) => {
                        const noteId = selectedRow.importKey;
                        const resolution = duplicateResolutions[noteId];
                        const action =
                          resolution?.turnActions?.[conflict.turnIndex] ?? 'useImported';
                        const disabled =
                          (duplicateResolutions[noteId]?.decision ?? 'keepAsNew') !== 'replace';
                        const existingText = [
                          conflict.existingSubjectName,
                          conflict.existingTopicName,
                          conflict.existingNoteTitle,
                        ]
                          .filter(Boolean)
                          .join(' / ');
                        return (
                          <TableRow key={conflict.turnIndex}>
                            <TableCell>{conflict.turnIndex}</TableCell>
                            <TableCell>{existingText || conflict.existingNoteId}</TableCell>
                            <TableCell>
                              <ToggleButtonGroup
                                size="small"
                                value={action}
                                exclusive
                                disabled={disabled}
                                onChange={(_, value) => {
                                  if (!value) return;
                                  setTurnAction(noteId, conflict.turnIndex, value);
                                }}
                              >
                                <ToggleButton value="useImported">Use imported</ToggleButton>
                                <ToggleButton value="useExisting">Use existing</ToggleButton>
                              </ToggleButtonGroup>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Select an imported row to see its content here.
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </>
  );

  const [markdownDrag, setMarkdownDrag] = React.useState<{
    active: boolean;
    startX: number;
    startLeft: number;
  }>({ active: false, startX: 0, startLeft: DEFAULT_MARKDOWN_SPLIT_LEFT });

  const MIN_MARKDOWN_FRACTION = 0.2;

  const handleMarkdownDividerMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    event.preventDefault();
    setMarkdownDrag({
      active: true,
      startX: event.clientX,
      startLeft: markdownSplitLeft,
    });
  };

  const handleWindowMouseMoveMarkdown = React.useCallback(
    (event: MouseEvent) => {
      if (!markdownDrag.active || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const totalWidth = rect.width || 1;
      const deltaX = event.clientX - markdownDrag.startX;
      const deltaFrac = deltaX / totalWidth;

      let nextLeft = markdownDrag.startLeft + deltaFrac;
      nextLeft = Math.max(MIN_MARKDOWN_FRACTION, Math.min(nextLeft, 1 - MIN_MARKDOWN_FRACTION));
      setMarkdownSplitLeft(nextLeft);
    },
    [markdownDrag.active, markdownDrag.startLeft, markdownDrag.startX, markdownSplitLeft],
  );

  const handleWindowMouseUpMarkdown = React.useCallback(() => {
    if (markdownDrag.active) setMarkdownDrag((p) => ({ ...p, active: false }));
  }, [markdownDrag.active]);

  React.useEffect(() => {
    if (!markdownDrag.active) return;

    window.addEventListener('mousemove', handleWindowMouseMoveMarkdown);
    window.addEventListener('mouseup', handleWindowMouseUpMarkdown);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMoveMarkdown);
      window.removeEventListener('mouseup', handleWindowMouseUpMarkdown);
    };
  }, [markdownDrag.active, handleWindowMouseMoveMarkdown, handleWindowMouseUpMarkdown]);

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

  const bannerDuplicateTurnCount = duplicateTurnCount ?? 0;

  const hasAnyDuplicates: boolean =
    Boolean(
      rows?.some(
        (r) =>
          (r.duplicateStatus && r.duplicateStatus !== 'none') ||
          (typeof r.duplicateCount === 'number' && r.duplicateCount > 0),
      ),
    ) ||
    Boolean(
      combinedNote &&
      ((combinedNote as any).duplicateStatus &&
        (combinedNote as any).duplicateStatus !== 'none'),
    ) ||
    hasDuplicateTurns;

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
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle>Review Imported Notes</DialogTitle>
      <DialogContent
        dividers
        sx={{
          p: 2,
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {hasDuplicateTurns && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This import contains {bannerDuplicateTurnCount} turn
            {bannerDuplicateTurnCount === 1 ? '' : 's'} that already exist in Chatalog. No
            changes are made automatically yet.
          </Alert>
        )}
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
            flex: '1 1 auto',
            overflow: 'hidden',
          }}
        >
          {viewMode === 'simple' && (
            <Box sx={{ ...panelSx, flex: '1 1 auto', pr: 0 }}>
              {renderLeftPanelContent()}
            </Box>
          )}

          {viewMode === 'markdown' && (
            <>
              <Box
                sx={{
                  ...panelSx,
                  flex: '0 0 auto',
                  flexBasis: `${markdownSplitLeft * 100}%`,
                  minWidth: 360,
                  minHeight: 0,
                  overflow: 'hidden',
                  pr: 2,
                }}
              >
                {renderLeftPanelContent()}
              </Box>

              <Box
                onMouseDown={handleMarkdownDividerMouseDown}
                sx={{
                  width: 6,
                  cursor: 'col-resize',
                  flexShrink: 0,
                  alignSelf: 'stretch',
                  bgcolor: 'divider',
                  opacity: 0.6,
                  transition: 'opacity 120ms ease',
                  '&:hover': { opacity: 1 },
                  '&:active': { opacity: 1 },
                  position: 'relative',
                  zIndex: 1,
                }}
              />

              <Box
                sx={{
                  ...panelSx,
                  flex: '0 0 auto',
                  flexBasis: `${(1 - markdownSplitLeft) * 100}%`,
                  minWidth: 0,
                  minHeight: 0,
                  overflow: 'hidden',
                  pl: 2,
                }}
              >
                {renderRightPanelContent()}
              </Box>
            </>
          )}

          {viewMode === 'full' && (
            <>
              <Box
                sx={{
                  ...panelSx,
                  flex: '0 0 auto',
                  flexBasis: `${panelWidths[0] * 100}%`,
                  pr: 2,
                }}
              >
                {renderLeftPanelContent()}
              </Box>

              <Box
                onMouseDown={(e) => handleDividerMouseDown(e, 0)}
                sx={{
                  width: 6,
                  cursor: 'col-resize',
                  flexShrink: 0,
                  alignSelf: 'stretch',
                  bgcolor: 'divider',
                  opacity: 0.6,
                  transition: 'opacity 120ms ease',
                  '&:hover': { opacity: 1 },
                  '&:active': { opacity: 1 },
                  position: 'relative',
                  zIndex: 1,
                }}
              />

              <Box
                sx={{
                  ...panelSx,
                  flex: '0 0 auto',
                  flexBasis: `${panelWidths[1] * 100}%`,
                  px: 2,
                }}
              >
                {renderMiddlePanelContent()}
              </Box>

              <Box
                onMouseDown={(e) => handleDividerMouseDown(e, 1)}
                sx={{
                  width: 6,
                  cursor: 'col-resize',
                  flexShrink: 0,
                  alignSelf: 'stretch',
                  bgcolor: 'divider',
                  opacity: 0.6,
                  transition: 'opacity 120ms ease',
                  '&:hover': { opacity: 1 },
                  '&:active': { opacity: 1 },
                  position: 'relative',
                  zIndex: 1,
                }}
              />

              <Box
                sx={{
                  ...panelSx,
                  flex: '0 0 auto',
                  flexBasis: `${panelWidths[2] * 100}%`,
                  pl: 2,
                }}
              >
                {renderRightPanelContent()}
              </Box>
            </>
          )}
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
