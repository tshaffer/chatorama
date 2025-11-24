import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectNoteStatusVisibility,
  setNoteStatusVisibility,
} from './settingsSlice';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsDialog({ open, onClose }: Props) {
  const dispatch = useDispatch();
  const visibility = useSelector(selectNoteStatusVisibility);

  const handleChange =
    (field: 'showUnset' | 'showCompleted' | 'showOther') =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      dispatch(
        setNoteStatusVisibility({
          [field]: event.target.checked,
        }),
      );
    };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent dividers>
        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                checked={visibility.showUnset}
                onChange={handleChange('showUnset')}
              />
            }
            label="Show status indicator when note status is not set"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={visibility.showCompleted}
                onChange={handleChange('showCompleted')}
              />
            }
            label="Show status indicator when note status is 'completed'"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={visibility.showOther}
                onChange={handleChange('showOther')}
              />
            }
            label="Show status indicator for other statuses"
          />
        </FormGroup>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
