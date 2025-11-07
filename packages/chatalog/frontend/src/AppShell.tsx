// chatalog/frontend/src/AppShell.tsx
import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Stack, Box } from '@mui/material';
import ImportChatworthyButton from './components/ImportChatworthyButton';

export default function AppShell() {
  const { pathname } = useLocation();

  const isActive = (to: string) =>
    pathname === to ||
    (to === '/s' && pathname.startsWith('/s')) ||
    (to === '/' && (pathname === '/' || pathname === '/home'));

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" color="primary" enableColorOnDark>
        <Toolbar disableGutters sx={{ px: { xs: 1, sm: 1.5 } }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Chatalog
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button component={Link} to="/" color="inherit" variant={isActive('/') ? 'outlined' : 'text'}>
              Home
            </Button>
            <Button component={Link} to="/s" color="inherit" variant={isActive('/s') ? 'outlined' : 'text'}>
              Notes
            </Button>
            <ImportChatworthyButton />
          </Stack>
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
        <Outlet />
      </Box>
    </Box>
  );
}
