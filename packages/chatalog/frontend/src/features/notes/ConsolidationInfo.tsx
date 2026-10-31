// frontend/src/features/notes/ConsolidationInfo.tsx
// Shown on the note page:
//  - an "Archived" banner on a note that was archived (e.g. by Consolidate)
//  - a collapsed "Sources (N)" list on a note created by Consolidate or from Ask Claude
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Link,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { skipToken } from '@reduxjs/toolkit/query';
import type { Note } from '@chatorama/chatalog-shared';
import {
  useGetConsolidationSourcesQuery,
  useGetNoteQuery,
  useSetNotesArchivedMutation,
} from './notesApi';

export default function ConsolidationInfo({ note }: { note: Note }) {
  const navigate = useNavigate();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [setNotesArchived, { isLoading: isUnarchiving }] = useSetNotesArchivedMutation();

  const sourceCount = note.consolidation?.sourceNoteIds?.length ?? 0;
  const isAnswer = note.consolidation?.kind === 'answer';
  const noun = sourceCount === 1 ? 'note' : 'notes';
  const { data: sources = [], isSuccess: sourcesLoaded } = useGetConsolidationSourcesQuery(
    sourceCount > 0 && sourcesOpen ? note.id : skipToken,
  );
  const { data: consolidatedInto } = useGetNoteQuery(
    note.archived && note.consolidatedIntoNoteId ? note.consolidatedIntoNoteId : skipToken,
  );

  if (!note.archived && sourceCount === 0) return null;

  return (
    <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {note.archived && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={isUnarchiving}
              onClick={() => setNotesArchived({ noteIds: [note.id], archived: false })}
            >
              Unarchive
            </Button>
          }
        >
          This note is archived, so it’s hidden from its topic, Search, and Ask.
          {note.consolidatedIntoNoteId && (
            <>
              {' '}It was consolidated into{' '}
              <Link component={RouterLink} to={`/n/${note.consolidatedIntoNoteId}`}>
                {consolidatedInto?.title ?? 'a newer note'}
              </Link>
              .
            </>
          )}
        </Alert>
      )}

      {sourceCount > 0 && (
        <Box>
          <Button
            size="small"
            color="inherit"
            sx={{ color: 'text.secondary' }}
            startIcon={sourcesOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setSourcesOpen((v) => !v)}
          >
            {isAnswer
              ? `Claude’s answer about ${sourceCount} ${noun}`
              : note.consolidation?.kind === 'change'
                ? `Created with Claude from ${sourceCount} ${noun}`
                : `Consolidated from ${sourceCount} ${noun}`}
          </Button>
          <Collapse in={sourcesOpen}>
            <List dense disablePadding sx={{ pl: 1 }}>
              {sources.map((s) => (
                <ListItemButton key={s.id} onClick={() => navigate(`/n/${s.id}`)}>
                  <ListItemText
                    primary={
                      <span>
                        {s.title || 'Untitled'}
                        {s.archived && (
                          <Chip size="small" label="Archived" variant="outlined" sx={{ ml: 1 }} />
                        )}
                      </span>
                    }
                  />
                </ListItemButton>
              ))}
              {sourcesLoaded && sources.length < sourceCount && (
                <ListItemText
                  sx={{ pl: 2 }}
                  secondary={`${sourceCount - sources.length} source ${
                    sourceCount - sources.length === 1 ? 'note has' : 'notes have'
                  } since been deleted.`}
                />
              )}
            </List>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}
