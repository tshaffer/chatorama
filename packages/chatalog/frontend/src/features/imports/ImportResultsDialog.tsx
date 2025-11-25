// frontend/src/features/imports/ImportResultsDialog.tsx
import React, { useMemo, useState } from 'react';
import type { Subject, Topic } from '@chatorama/chatalog-shared';
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
  IconButton,
  Collapse,
  Box,
  Typography,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ReactMarkdown from 'react-markdown';
import type { ImportedNoteSummary } from '../imports/importsApi';

export type EditableImportedNoteRow = ImportedNoteSummary & {
  editedTitle: string;
  subjectLabel: string;
  topicLabel: string;
  showBody: boolean;
  // track whether user has manually changed subject/topic for this row
  subjectTouched: boolean;
  topicTouched: boolean;
};

type SubjectWithTopics = Subject & { topics?: Topic[] };

type Props = {
  open: boolean;
  onClose: () => void;
  importedNotes: ImportedNoteSummary[];
  subjects: SubjectWithTopics[];
  onApply: (rows: EditableImportedNoteRow[]) => void;
};

export function ImportResultsDialog({
  open,
  onClose,
  importedNotes,
  subjects,
  onApply,
}: Props) {
  const [defaultSubjectLabel, setDefaultSubjectLabel] = useState('');
  const [defaultTopicLabel, setDefaultTopicLabel] = useState('');
  const subjectBulkUpdateRef = React.useRef(false);
  const topicBulkUpdateRef = React.useRef(false);

  const [rows, setRows] = useState<EditableImportedNoteRow[]>(() =>
    importedNotes.map((n) => ({
      ...n,
      editedTitle: n.title,
      subjectLabel: n.subjectName ?? '',
      topicLabel: n.topicName ?? '',
      showBody: false,
      subjectTouched: false,
      topicTouched: false,
    })),
  );

  // Initialize defaults + rows whenever a new import result comes in
  React.useEffect(() => {
    if (!importedNotes.length) return;

    const firstSubject =
      importedNotes.find((n) => n.subjectName)?.subjectName ?? '';
    const firstTopic =
      importedNotes.find((n) => n.topicName)?.topicName ?? '';

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
      })),
    );
  }, [importedNotes]);

  // NEW: clear bulk flags after rows change
  React.useEffect(() => {
    subjectBulkUpdateRef.current = false;
    topicBulkUpdateRef.current = false;
  }, [rows]);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>();

    if (defaultSubjectLabel?.trim()) set.add(defaultSubjectLabel.trim());

    importedNotes
      .map((n) => n.subjectName?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));

    rows
      .map((r) => r.subjectLabel?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));

    subjects
      .map((s) => s.name?.trim())
      .filter(Boolean)
      .forEach((name) => set.add(name as string));

    return Array.from(set);
  }, [defaultSubjectLabel, importedNotes, rows, subjects]);

  const topicOptionsForSubject = (
    subjectLabel: string,
    currentTopicLabel: string,
  ) => {
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
    setRows((prev) =>
      prev.map((r) => (r.importKey === importKey ? { ...r, ...patch } : r)),
    );
  };

  const updateDefaultSubject = (next: string) => {
    setDefaultSubjectLabel(next);
    subjectBulkUpdateRef.current = true;
    setRows((prevRows) =>
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
    setRows((prevRows) =>
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
    onApply(rows);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Review Imported Notes</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Set default Subject/Topic labels below, then tweak each note as needed.
          You can either pick from the list or type new labels. Changing a
          default updates any rows whose Subject/Topic you haven&apos;t manually
          edited yet. Use the arrow icon on the left to expand and see the note
          body rendered as markdown.
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
            options={topicOptionsForSubject(
              defaultSubjectLabel,
              defaultTopicLabel,
            )}
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

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Title</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Topic</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <React.Fragment key={row.importKey}>
                <TableRow hover>
                  <TableCell padding="checkbox">
                    <IconButton
                      size="small"
                      onClick={() =>
                        handleRowChange(row.importKey, {
                          showBody: !row.showBody,
                        })
                      }
                      aria-label={
                        row.showBody ? 'Hide note body' : 'Show note body'
                      }
                    >
                      {row.showBody ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </TableCell>
                  <TableCell sx={{ minWidth: 240 }}>
                    <TextField
                      fullWidth
                      size="small"
                      value={row.editedTitle}
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
                        />
                      )}
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                  <Autocomplete
                    freeSolo
                    options={topicOptionsForSubject(
                      row.subjectLabel,
                      row.topicLabel,
                    )}
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
                        />
                      )}
                    />
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell
                    style={{ paddingBottom: 0, paddingTop: 0 }}
                    colSpan={4}
                  >
                    <Collapse in={row.showBody} timeout="auto" unmountOnExit>
                      <Box
                        sx={{
                          p: 2,
                          borderTop: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="subtitle2" gutterBottom>
                          Note body
                        </Typography>
                        <Box
                          sx={{
                            '& p': { mb: 1 },
                            '& pre': {
                              p: 1,
                              borderRadius: 1,
                              bgcolor: 'action.hover',
                              overflowX: 'auto',
                            },
                            '& code': {
                              fontFamily:
                                'Monaco, Menlo, Consolas, "Courier New", monospace',
                            },
                          }}
                        >
                          <ReactMarkdown>{row.body}</ReactMarkdown>
                        </Box>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
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
