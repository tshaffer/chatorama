// chatalog/frontend/src/pages/QuickNotePage.tsx
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Box, Stack, Typography, Breadcrumbs, Link, Skeleton } from '@mui/material';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import '../styles/markdown.css';

import { useGetQuickNotesQuery } from '../features/quickNotes/quickNotesApi';

type QuickNote = {
  id: string;
  title: string;
  markdown: string;
  subjectId?: string;
  topicId?: string;
  createdAt: string;
  updatedAt: string;
};

export default function QuickNotePage() {
  const { quickNoteId } = useParams<{ quickNoteId: string }>();
  const {
    data: quickNotes = [],
    isLoading,
    isError,
  } = useGetQuickNotesQuery();

  const note = quickNotes.find((qn: QuickNote) => qn.id === quickNoteId);

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="text" width="40%" height={40} />
        <Skeleton variant="text" width="20%" />
        <Skeleton variant="rounded" height={200} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (isError || !note) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" gutterBottom>
          Quick Note not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          We couldn&apos;t load that quick note. It may have been deleted.
        </Typography>
        <Link component={RouterLink} to="/quick-notes">
          Back to Quick Notes
        </Link>
      </Box>
    );
  }

  const created = note.createdAt
    ? new Date(note.createdAt).toLocaleString()
    : undefined;

  const title =
    note.title?.trim() ||
    (note.markdown ? note.markdown.split('\n')[0] : '(untitled quick note)');

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Breadcrumbs aria-label="breadcrumb">
          <Link component={RouterLink} to="/quick-notes" underline="hover" color="inherit">
            Quick Notes
          </Link>
          <Typography color="text.primary" noWrap>
            {title}
          </Typography>
        </Breadcrumbs>

        <Typography variant="h4">{title}</Typography>

        {created && (
          <Typography variant="body2" color="text.secondary">
            Created {created}
          </Typography>
        )}
      </Stack>

      <Box
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          maxWidth: '80ch',
        }}
      >
        {/* markdown-body class for your existing markdown styling */}
        <Box className="markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks] as any}
            rehypePlugins={[rehypeHighlight] as any}
          >
            {note.markdown ?? ''}
          </ReactMarkdown>
        </Box>
      </Box>
    </Box>
  );
}
