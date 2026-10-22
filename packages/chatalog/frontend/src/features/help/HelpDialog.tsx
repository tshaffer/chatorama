import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog, DialogTitle, DialogContent, Box, Stack, TextField, Button,
  Typography, Chip, Divider, CircularProgress, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { helpTopics, helpCategoryOrder, type HelpTopic } from '@chatorama/chatalog-shared';
import { askHelpQuestion, type HelpAskCitation, type HelpConversationTurn } from './helpApi';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
  initialSlug?: string | null;
}

function topicMatchesQuery(topic: HelpTopic, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    topic.title.toLowerCase().includes(q) ||
    topic.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

interface ConversationTurnState extends HelpConversationTurn {
  citations: HelpAskCitation[];
}

export default function HelpDialog({ open, onClose, initialSlug }: HelpDialogProps) {
  const [selectedSlug, setSelectedSlug] = useState<string>(
    initialSlug ?? helpTopics[0]?.slug ?? '',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [askQuery, setAskQuery] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationTurnState[]>([]);

  useEffect(() => {
    if (open && initialSlug) setSelectedSlug(initialSlug);
  }, [open, initialSlug]);

  const filteredTopics = useMemo(
    () => helpTopics.filter((t) => topicMatchesQuery(t, searchQuery)),
    [searchQuery],
  );

  const groupedTopics = useMemo(() => {
    const byCategory = new Map<string, HelpTopic[]>();
    for (const topic of filteredTopics) {
      const list = byCategory.get(topic.category) ?? [];
      list.push(topic);
      byCategory.set(topic.category, list);
    }
    for (const list of byCategory.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return helpCategoryOrder
      .filter((cat) => byCategory.has(cat))
      .map((cat) => ({ category: cat, topics: byCategory.get(cat) ?? [] }));
  }, [filteredTopics]);

  const selectedTopic = helpTopics.find((t) => t.slug === selectedSlug) ?? null;

  async function handleAsk() {
    const question = askQuery.trim();
    if (!question) return;
    setAskLoading(true);
    setAskError(null);
    try {
      const result = await askHelpQuestion(
        question,
        conversation.map(({ question: q, answer, citedSlugs, toolUseId }) => ({
          question: q,
          answer,
          citedSlugs,
          toolUseId,
        })),
      );
      setConversation((prev) => [
        ...prev,
        {
          question,
          answer: result.answer,
          citedSlugs: result.citedSlugs,
          toolUseId: result.toolUseId,
          citations: result.citations,
        },
      ]);
      setAskQuery('');
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Failed to get an answer');
    } finally {
      setAskLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth={false} fullWidth
      PaperProps={{ sx: { width: 'min(1100px, 96vw)', height: 'min(88vh, 760px)', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
        <Typography variant="h6">Help</Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close help">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ flex: 1, minHeight: 0, p: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box sx={{
          width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: 1, borderColor: 'divider', p: 1.5, minHeight: 0,
        }}>
          <TextField
            size="small"
            placeholder="Filter topics…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ mb: 1 }}
            fullWidth
          />
          <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {groupedTopics.map(({ category, topics }) => (
              <Box key={category}>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 1.5, mb: 0.5, px: 1 }}>
                  {category}
                </Typography>
                {topics.map((topic) => (
                  <Button
                    key={topic.slug}
                    fullWidth
                    size="small"
                    variant={topic.slug === selectedSlug ? 'contained' : 'text'}
                    disableElevation
                    onClick={() => setSelectedSlug(topic.slug)}
                    sx={{ justifyContent: 'flex-start', textTransform: 'none', fontWeight: topic.slug === selectedSlug ? 600 : 400, mb: 0.25 }}
                  >
                    {topic.title}
                  </Button>
                ))}
              </Box>
            ))}
            {groupedTopics.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                No topics match "{searchQuery}".
              </Typography>
            )}
          </Box>
        </Box>

        {/* Main pane */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', p: 2 }}>
          {/* Ask row */}
          <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Ask a question about Chatalog…"
              value={askQuery}
              onChange={(e) => setAskQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAsk(); }}
              disabled={askLoading}
            />
            <Button
              variant="contained"
              disableElevation
              disabled={askLoading || !askQuery.trim()}
              onClick={() => void handleAsk()}
              sx={{ whiteSpace: 'nowrap', minWidth: 80 }}
            >
              {askLoading ? <CircularProgress size={18} color="inherit" /> : 'Ask'}
            </Button>
          </Stack>

          {askError && (
            <Typography variant="caption" color="error" sx={{ mb: 1, display: 'block' }}>
              {askError}
            </Typography>
          )}

          {/* Conversation history */}
          {conversation.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Button size="small" variant="text" color="inherit"
                sx={{ fontSize: 11, p: 0, mb: 1, textDecoration: 'underline', minWidth: 0 }}
                onClick={() => setConversation([])}
              >
                Clear conversation
              </Button>
              {conversation.map((turn, idx) => (
                <Box key={turn.toolUseId ?? idx}
                  sx={{ bgcolor: 'action.hover', border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1 }}
                >
                  <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    You asked: {turn.question}
                  </Typography>
                  <MarkdownBody content={turn.answer} />
                  {turn.citations.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      {turn.citations.map((citation) => (
                        <Chip
                          key={citation.slug}
                          label={citation.title}
                          size="small"
                          variant="outlined"
                          clickable
                          onClick={() => setSelectedSlug(citation.slug)}
                          sx={{ mr: 0.5, mt: 0.5, fontSize: 11 }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {/* Selected topic */}
          {selectedTopic && (
            <Box component="article">
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                {selectedTopic.title}
              </Typography>
              <MarkdownBody content={selectedTopic.body} />
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>{children}</Typography>,
        h2: ({ children }) => <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2 }}>{children}</Typography>,
        h3: ({ children }) => <Typography variant="body2" fontWeight={700} sx={{ mt: 1.5 }}>{children}</Typography>,
        p: ({ children }) => <Typography variant="body2" sx={{ mb: 0.75, lineHeight: 1.6 }}>{children}</Typography>,
        ul: ({ children }) => <Box component="ul" sx={{ pl: 2.5, mb: 0.75 }}>{children}</Box>,
        li: ({ children }) => <Typography component="li" variant="body2" sx={{ mb: 0.25, lineHeight: 1.6 }}>{children}</Typography>,
        code: ({ children }) => <Box component="code" sx={{ bgcolor: 'action.selected', borderRadius: 0.5, px: 0.5, fontSize: 12, fontFamily: 'monospace' }}>{children}</Box>,
        table: ({ children }) => <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 12, mb: 1, width: '100%' }}>{children}</Box>,
        th: ({ children }) => <Box component="th" sx={{ border: 1, borderColor: 'divider', p: '4px 8px', textAlign: 'left', bgcolor: 'action.hover' }}>{children}</Box>,
        td: ({ children }) => <Box component="td" sx={{ border: 1, borderColor: 'divider', p: '4px 8px', textAlign: 'left' }}>{children}</Box>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
