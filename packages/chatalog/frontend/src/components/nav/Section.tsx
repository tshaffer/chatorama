// src/components/nav/Section.tsx
import { List, ListSubheader, Divider } from '@mui/material';

export function Section({
  title,
  children,
  denseDivider = false,
}: {
  title: string;
  children: React.ReactNode;
  denseDivider?: boolean;
}) {
  return (
    <>
      <List
        dense
        disablePadding
        subheader={
          <ListSubheader
            sx={{
              position: 'sticky',
              top: 0,
              bgcolor: 'background.paper',
              fontSize: 12,
              lineHeight: 1.8,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            {title}
          </ListSubheader>
        }
      >
        {children}
      </List>
      <Divider sx={{ my: denseDivider ? 1 : 1.5, opacity: 0.5 }} />
    </>
  );
}
