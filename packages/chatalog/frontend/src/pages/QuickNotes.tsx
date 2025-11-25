// chatalog/frontend/src/pages/QuickNotes.tsx
import { Link } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Divider,
  Skeleton,
} from '@mui/material';
import { useGetQuickNotesQuery } from '../features/quickNotes/quickNotesApi';

export type QuickNote = {
  id: string;
  title: string;
  markdown: string;
  subjectId?: string;
  topicId?: string;
  createdAt: string;
  updatedAt: string;
};

const truncate = (text: string, max = 140) =>
  text.length > max ? text.slice(0, max - 1) + '…' : text;

export default function QuickNotesPage() {
  const { data: quickNotes = [], isLoading } = useGetQuickNotesQuery();

  return (
    <Box sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1.5 }}
      >
        <Typography variant="h4">Quick Notes</Typography>
        <Typography variant="body2" color="text.secondary">
          Created via Quick Capture (⌘/Ctrl+Shift+N)
        </Typography>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {isLoading && (
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
          <Skeleton variant="rounded" height={56} />
        </Stack>
      )}

      {!isLoading && quickNotes.length === 0 && (
        <Typography color="text.secondary">
          No quick notes yet. Use the <strong>Quick Capture</strong> button in the top bar to add one.
        </Typography>
      )}

      {!isLoading && quickNotes.length > 0 && (
        <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
          {quickNotes.map((qn: QuickNote) => {
            const title =
              qn.title?.trim() ||
              (qn.markdown ? truncate(qn.markdown.split('\n')[0], 60) : '(untitled quick note)');
            const preview =
              qn.markdown ? truncate(qn.markdown.replace(/\s+/g, ' ').trim(), 180) : '';

            return (
              <ListItemButton
                key={qn.id}
                component={Link}
                to={`/quick-notes/${qn.id}`}
              >
                <ListItemText
                  disableTypography
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle1" noWrap>
                        {title}
                      </Typography>
                      <Chip
                        size="small"
                        label="Quick"
                        color="primary"
                        variant="outlined"
                      />
                    </Stack>
                  }
                  secondary={
                    <Box>
                      {preview && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          {preview}
                        </Typography>
                      )}
                      {qn.createdAt && (
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ display: 'block', mt: 0.5 }}
                        >
                          Created {new Date(qn.createdAt).toLocaleString()}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItemButton>
            );
          })}
        </List>
      )}
    </Box>
  );
}
