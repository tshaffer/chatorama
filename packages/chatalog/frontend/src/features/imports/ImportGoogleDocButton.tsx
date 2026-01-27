import { useState } from 'react';
import { Tooltip, Button } from '@mui/material';
import ImportGoogleDocDialog from './ImportGoogleDocDialog';

type Props = {
  tooltip?: string;
  onImported?: (noteId: string) => void;
};

export default function ImportGoogleDocButton({
  tooltip = 'Import Google Doc by fileId',
  onImported,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title={tooltip}>
        <span>
          <Button size="small" variant="outlined" onClick={() => setOpen(true)}>
            Import Google Doc
          </Button>
        </span>
      </Tooltip>
      <ImportGoogleDocDialog
        open={open}
        onClose={() => setOpen(false)}
        onImported={onImported}
      />
    </>
  );
}
