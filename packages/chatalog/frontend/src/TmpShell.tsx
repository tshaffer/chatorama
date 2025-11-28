// chatalog/frontend/src/TmpShell.tsx
import { AppBar, Toolbar, Typography, Box } from '@mui/material';

export default function TmpShell() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="primary" enableColorOnDark>
        <Toolbar disableGutters sx={{ px: { xs: 1, sm: 1.5 } }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Chatalog
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Full-width main area with small side padding */}
      <Box
        component="main"
        sx={{
          flex: 1,
          width: '100%',
          px: { xs: 1, sm: 1.5 },   // tiny margins (~8–12px each side)
          py: 3,
          minWidth: 0,              // prevents child overflow clipping
        }}
      >
        pizza
      </Box>
    </Box>
  );
}
