import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog, DialogTitle, DialogContent, Box, Stack, TextField, Button,
  Typography, Chip, Divider, CircularProgress, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import { askQuestion, type AskConversationTurn, type AskSource } from './askApi';

interface AskDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ConversationEntry extends AskConversationTurn {
  sources: AskSource[];
}

export default function AskDialog({ open, onClose }: AskDialogProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation, loading]);

  async function handleAsk() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const history: AskConversationTurn[] = conversation.map(({ question: qu, answer }) => ({ question: qu, answer }));
      const result = await askQuestion(q, history);
      setConversation((prev) => [
        ...prev,
        { question: q, answer: result.answer, sources: result.sources },
      ]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get an answer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: 'min(860px, 96vw)',
          height: 'min(88vh, 740px)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
        <Box>
          <Typography variant="h6" component="span">Ask</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
            Search your notes &amp; recipes with natural language
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ flex: 1, minHeight: 0, p: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Conversation area */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 2.5, py: 2 }}>
          {conversation.length === 0 && !loading && (
            <Box sx={{ color: 'text.secondary', textAlign: 'center', mt: 6 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Ask anything about your notes or recipes.
              </Typography>
              <Typography variant="caption" display="block">
                "How long does it take to make broccoli cheddar beans?"
              </Typography>
              <Typography variant="caption" display="block">
                "What did I learn about React hooks?"
              </Typography>
              <Typography variant="caption" display="block">
                "Find my notes on cycling training"
              </Typography>
            </Box>
          )}

          {conversation.map((entry, idx) => (
            <Box key={idx} sx={{ mb: 3 }}>
              {/* Question bubble */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                <Box sx={{
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  borderRadius: '12px 12px 2px 12px',
                  px: 1.5,
                  py: 0.75,
                  maxWidth: '80%',
                }}>
                  <Typography variant="body2">{entry.question}</Typography>
                </Box>
              </Box>

              {/* Answer */}
              <Box sx={{
                bgcolor: 'action.hover',
                border: 1,
                borderColor: 'divider',
                borderRadius: '2px 12px 12px 12px',
                px: 1.75,
                py: 1.25,
                maxWidth: '90%',
              }}>
                <AnswerBody content={entry.answer} />

                {entry.sources.length > 0 && (
                  <Box sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.75 }}>
                      Sources consulted:
                    </Typography>
                    {entry.sources.map((src) => (
                      <Chip
                        key={src.id}
                        size="small"
                        variant="outlined"
                        icon={
                          src.docKind === 'recipe'
                            ? <RestaurantMenuIcon sx={{ fontSize: 13 }} />
                            : <DescriptionOutlinedIcon sx={{ fontSize: 13 }} />
                        }
                        label={src.title}
                        sx={{ mr: 0.5, mt: 0.5, fontSize: 11 }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          ))}

          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, color: 'text.secondary' }}>
              <CircularProgress size={14} color="inherit" />
              <Typography variant="caption">Searching your notes…</Typography>
            </Box>
          )}

          <div ref={bottomRef} />
        </Box>

        <Divider />

        {/* Input area */}
        <Box sx={{ px: 2.5, py: 1.5 }}>
          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
              {error}
            </Typography>
          )}
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              size="small"
              fullWidth
              multiline
              maxRows={4}
              placeholder="Ask a question about your notes or recipes…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleAsk();
                }
              }}
              disabled={loading}
            />
            <Button
              variant="contained"
              disableElevation
              disabled={loading || !question.trim()}
              onClick={() => void handleAsk()}
              sx={{ whiteSpace: 'nowrap', minWidth: 72, alignSelf: 'flex-end' }}
            >
              {loading ? <CircularProgress size={18} color="inherit" /> : 'Ask'}
            </Button>
            {conversation.length > 0 && (
              <Button
                size="small"
                variant="text"
                color="inherit"
                disabled={loading}
                onClick={() => setConversation([])}
                sx={{ whiteSpace: 'nowrap', fontSize: 11, minWidth: 0 }}
              >
                Clear
              </Button>
            )}
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function AnswerBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1.5 }}>{children}</Typography>,
        h2: ({ children }) => <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1.5 }}>{children}</Typography>,
        h3: ({ children }) => <Typography variant="body2" fontWeight={700} sx={{ mt: 1 }}>{children}</Typography>,
        p: ({ children }) => <Typography variant="body2" sx={{ mb: 0.5, lineHeight: 1.6 }}>{children}</Typography>,
        ul: ({ children }) => <Box component="ul" sx={{ pl: 2.5, mb: 0.5 }}>{children}</Box>,
        ol: ({ children }) => <Box component="ol" sx={{ pl: 2.5, mb: 0.5 }}>{children}</Box>,
        li: ({ children }) => <Typography component="li" variant="body2" sx={{ mb: 0.25, lineHeight: 1.6 }}>{children}</Typography>,
        code: ({ children }) => (
          <Box component="code" sx={{ bgcolor: 'action.selected', borderRadius: 0.5, px: 0.5, fontSize: 12, fontFamily: 'monospace' }}>
            {children}
          </Box>
        ),
        table: ({ children }) => <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: 12, mb: 1, width: '100%' }}>{children}</Box>,
        th: ({ children }) => <Box component="th" sx={{ border: 1, borderColor: 'divider', p: '4px 8px', textAlign: 'left', bgcolor: 'action.hover' }}>{children}</Box>,
        td: ({ children }) => <Box component="td" sx={{ border: 1, borderColor: 'divider', p: '4px 8px' }}>{children}</Box>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
