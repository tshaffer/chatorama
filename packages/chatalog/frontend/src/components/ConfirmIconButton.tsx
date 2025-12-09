import { useState } from 'react';
import { IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';

type Props = {
  title: string;
  message: string;
  onConfirm: () => Promise<void> | void;
  icon: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  tooltip?: string;
  stopPropagation?: boolean;
  disabled?: boolean;
};

export default function ConfirmIconButton({
  title, message, onConfirm, icon, size = 'small', tooltip, stopPropagation = true, disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);

  const handleOpen = (e: React.MouseEvent) => {
    if (disabled) return;
    if (stopPropagation) e.stopPropagation();
    setOpen(true);
  };
  const handleClose = () => setOpen(false);
  const handleConfirm = async () => {
    await onConfirm();
    setOpen(false);
  };

  const btn = (
    <IconButton size={size} onClick={handleOpen} disabled={disabled}>
      {icon}
    </IconButton>
  );

  return (
    <>
      {tooltip ? <Tooltip title={tooltip}>{btn}</Tooltip> : btn}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
