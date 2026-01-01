import { Paper, IconButton, InputBase } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { SxProps, Theme } from '@mui/material/styles';

type SearchBoxProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  sx?: SxProps<Theme>;
};

export default function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  sx,
}: SearchBoxProps) {
  return (
    <Paper
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      sx={{
        px: 1,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 999,
        ...(sx as any),
      }}
    >
      <IconButton type="button" onClick={onSubmit} size="small">
        <SearchIcon fontSize="small" />
      </IconButton>
      <InputBase
        sx={{
          ml: 1,
          flex: 1,
          '&::placeholder': { opacity: 1 },
        }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputProps={{ 'aria-label': placeholder }}
      />
    </Paper>
  );
}
