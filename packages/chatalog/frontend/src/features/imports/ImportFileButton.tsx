import { useRef } from 'react';
import { IconButton, Tooltip, Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import ImportChatworthyButton, { type ImportChatworthyRef } from './ImportChatworthyButton';
import ImportMarkdownButton, { type ImportMarkdownRef } from './ImportMarkdownButton';

/**
 * Detect whether a .md/.markdown file is a chat exporter export
 * (Chatworthy, Claude, Gemini, ClaudeCodeExporter) or a plain document.
 *
 * Chat exports always have gray-matter front matter containing at least
 * one of: noteId, chatId, chatTitle.
 */
async function detectFileType(file: File): Promise<'chatworthy' | 'markdown'> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.zip')) return 'chatworthy';

  // Read just enough to find the front-matter block (first 1 KB).
  const slice = await file.slice(0, 1024).text();

  if (slice.startsWith('---')) {
    const fmEnd = slice.indexOf('\n---', 3);
    const fm = fmEnd > 0 ? slice.slice(3, fmEnd) : slice.slice(3);
    if (/^\s*(noteId|chatId|chatTitle)\s*:/mi.test(fm)) {
      return 'chatworthy';
    }
  }

  return 'markdown';
}

type Props = {
  mode?: 'icon' | 'button';
  tooltip?: string;
  onDone?: () => void;
  defaultSubjectLabel?: string;
  defaultTopicLabel?: string;
};

export default function ImportFileButton({
  mode = 'button',
  tooltip = 'Import file (.md or .zip)',
  onDone,
  defaultSubjectLabel = '',
  defaultTopicLabel = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatworthyRef = useRef<ImportChatworthyRef>(null);
  const markdownRef = useRef<ImportMarkdownRef>(null);

  const pickFile = () => inputRef.current?.click();

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;

    const type = await detectFileType(file);
    if (type === 'chatworthy') {
      chatworthyRef.current?.processFile(file);
    } else {
      markdownRef.current?.processFile(file);
    }
  };

  const triggerIcon =
    mode === 'icon' ? (
      <Tooltip title={tooltip}>
        <span>
          <IconButton
            size="small"
            aria-label="Import file"
            onClick={pickFile}
            sx={(theme) => ({
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.common.white, 0.18),
              '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.28) },
            })}
          >
            <UploadFileIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    ) : (
      <Tooltip title={tooltip}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={pickFile}
            color="inherit"
          >
            Import File
          </Button>
        </span>
      </Tooltip>
    );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.zip"
        hidden
        onChange={onFileChosen}
      />
      {/* Both components always mounted; only the detected one receives processFile calls. */}
      <ImportChatworthyButton ref={chatworthyRef} mode="controlled" onDone={onDone} defaultSubjectLabel={defaultSubjectLabel} defaultTopicLabel={defaultTopicLabel} />
      <ImportMarkdownButton ref={markdownRef} mode="controlled" onDone={onDone} defaultSubjectLabel={defaultSubjectLabel} defaultTopicLabel={defaultTopicLabel} />
      {triggerIcon}
    </>
  );
}
