import { useMemo } from 'react';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  Chip,
  Tooltip,
  Link,
  Box,
  IconButton,
  Divider,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { Note } from '@chatorama/chatalog-shared';
import { API_BASE } from '../../lib/apiBase';
import { useGetNoteAssetsQuery } from './notesApi';

type Props = {
  open: boolean;
  onClose: () => void;
  note?: Note | null;
  subjectName?: string;
  topicName?: string;
};

function formatDate(iso?: string) {
  if (!iso) return { label: '—', iso: undefined };
  const d = new Date(iso);
  const label = Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  return { label, iso };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: (t) => `1px solid ${t.palette.divider}`,
        borderRadius: 2,
        p: 1.5,
        bgcolor: (t) =>
          t.palette.mode === 'dark'
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(0,0,0,0.02)',
      }}
    >
      <Typography
        variant="overline"
        sx={{ display: 'block', lineHeight: 1.2, letterSpacing: 0.6, mb: 1 }}
        color="text.secondary"
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function FieldRow({
  label,
  value,
  tooltip,
  trailing,
  mono,
}: {
  label: string;
  value?: React.ReactNode;
  tooltip?: string;
  trailing?: React.ReactNode;
  mono?: boolean;
}) {
  const content = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        columnGap: 1,
        rowGap: 0.25,
        alignItems: 'start',
        py: 0.5,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          minWidth: 0,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {value ?? '—'}
        </Typography>

        {trailing ? <Box sx={{ flex: '0 0 auto' }}>{trailing}</Box> : null}
      </Box>
    </Box>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} placement="top" arrow>
        <Box>{content}</Box>
      </Tooltip>
    );
  }

  return content;
}

export default function NotePropertiesDialog({
  open,
  onClose,
  note,
  subjectName,
  topicName,
}: Props) {
  const { createdAt, updatedAt, importedAt, importedFallback } = useMemo(() => {
    if (!note) {
      return {
        createdAt: undefined,
        updatedAt: undefined,
        importedAt: undefined,
        importedFallback: false,
      };
    }
    return {
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      importedAt: note.importedAt || note.createdAt,
      importedFallback: !note.importedAt && !!note.createdAt,
    };
  }, [note]);

  const copyText = async (text?: string) => {
    if (!text || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // noop
    }
  };

  const noteId = note?.id ?? skipToken;
  const { data: noteAssets = [] } = useGetNoteAssetsQuery(noteId);
  const viewerAsset = useMemo(() => {
    if (note?.sourceType !== 'googleDoc') return undefined;
    const match = noteAssets.find((asset) => asset.role === 'viewer');
    const asset = match?.asset as any;
    if (!asset) return undefined;
    const isPdf = asset.type === 'pdf' || asset.mimeType === 'application/pdf';
    return isPdf ? asset : undefined;
  }, [note?.sourceType, noteAssets]);

  const chatLink = note?.chatworthyChatId
    ? `https://chat.openai.com/c/${note.chatworthyChatId}`
    : undefined;
  const pdfLink =
    (viewerAsset?.id
      ? `${API_BASE}/assets/${viewerAsset.id}/content`
      : note?.sourceType === 'pdf' && note.pdfAssetId
        ? `${API_BASE}/assets/${note.pdfAssetId}/content`
        : undefined);

  const timeRows = [
    { label: 'Created', value: createdAt },
    { label: 'Updated', value: updatedAt },
    {
      label: importedFallback ? 'Imported (fallback)' : 'Imported',
      value: importedAt,
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack spacing={0.5}>
          <Typography variant="h6">Note properties</Typography>
          {note?.title ? (
            <Typography variant="body2" color="text.secondary" noWrap>
              {note.title}
            </Typography>
          ) : null}
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        <Stack spacing={1.5}>
          <Section title="Identity">
            <FieldRow
              label="Note ID"
              value={note?.id ?? '—'}
              mono
              trailing={
                <Tooltip title="Copy note id" arrow>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => copyText(note?.id)}
                      disabled={!note?.id}
                      aria-label="Copy note id"
                    >
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
              }
            />
            <Divider sx={{ my: 0.5 }} />

            <FieldRow
              label="Subject"
              value={
                subjectName
                  ? `${subjectName}${note?.subjectId ? ` (${note.subjectId})` : ''}`
                  : note?.subjectId ?? '—'
              }
              mono={!subjectName}
              tooltip={note?.subjectId || ''}
            />
            <FieldRow
              label="Topic"
              value={
                topicName
                  ? `${topicName}${note?.topicId ? ` (${note.topicId})` : ''}`
                  : note?.topicId ?? '—'
              }
              mono={!topicName}
              tooltip={note?.topicId || ''}
            />
            <FieldRow label="Status" value={note?.status || '—'} />

            <Box sx={{ pt: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                Tags
              </Typography>
              {(note?.tags?.length ?? 0) > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {note!.tags!.map((t) => (
                    <Chip key={t} size="small" label={t} />
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  None
                </Typography>
              )}
            </Box>
          </Section>

          <Section title="Time">
            {timeRows.map((row) => {
              const formatted = formatDate(row.value);
              return (
                <FieldRow
                  key={row.label}
                  label={row.label}
                  value={formatted.label}
                  tooltip={formatted.iso}
                />
              );
            })}
          </Section>

          <Section title="Sources">
            {(note?.sources?.length ?? 0) > 0 ? (
              <Stack spacing={0.75}>
                {note!.sources!.map((s, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      border: (t) => `1px solid ${t.palette.divider}`,
                      borderRadius: 1.5,
                      p: 1,
                      bgcolor: 'background.paper',
                    }}
                  >
                    <FieldRow label="Type" value={s.type || 'unknown'} />
                    <FieldRow
                      label="URL"
                      value={
                        s.url ? (
                          <Link
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            sx={{ display: 'inline-block', maxWidth: '100%' }}
                          >
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-block',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'bottom',
                              }}
                            >
                              {s.url}
                            </Box>
                          </Link>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            —
                          </Typography>
                        )
                      }
                      trailing={
                        s.url ? (
                          <Tooltip title="Copy URL" arrow>
                            <span>
                              <IconButton
                                size="small"
                                onClick={() => copyText(s.url)}
                                aria-label="Copy URL"
                              >
                                <ContentCopyIcon fontSize="inherit" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : null
                      }
                    />
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No sources
              </Typography>
            )}
          </Section>

          <Section title="Chatworthy provenance">
            <FieldRow label="File name" value={note?.chatworthyFileName || '—'} />
            <FieldRow
              label="Chat ID"
              value={note?.chatworthyChatId || '—'}
              mono
              trailing={
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Copy chat id" arrow>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => copyText(note?.chatworthyChatId || '')}
                        disabled={!note?.chatworthyChatId}
                        aria-label="Copy chat id"
                      >
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Open source chat" arrow>
                    <span>
                      <IconButton
                        size="small"
                        disabled={!chatLink}
                        onClick={() => {
                          if (!chatLink) return;
                          window.open(chatLink, '_blank', 'noopener,noreferrer');
                        }}
                        aria-label="Open source chat"
                      >
                        <OpenInNewIcon fontSize="inherit" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              }
            />
            <FieldRow label="Chat title" value={note?.chatworthyChatTitle || '—'} />
            <FieldRow label="Chatworthy note ID" value={note?.chatworthyNoteId || '—'} mono />
            <FieldRow label="Turn index" value={note?.chatworthyTurnIndex ?? '—'} />
            <FieldRow label="Total turns" value={note?.chatworthyTotalTurns ?? '—'} />
          </Section>

          <Section title="Legacy">
            <FieldRow label="sourceType" value={note?.sourceType || '—'} mono />
            <FieldRow label="sourceChatId" value={note?.sourceChatId || '—'} mono />
          </Section>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {pdfLink ? (
          <Button
            variant="outlined"
            onClick={() => window.open(pdfLink, '_blank', 'noopener,noreferrer')}
          >
            Open PDF
          </Button>
        ) : null}
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
