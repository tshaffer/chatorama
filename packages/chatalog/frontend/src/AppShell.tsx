// chatalog/frontend/src/AppShell.tsx
import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useParams, useMatch } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Stack, Box, alpha, IconButton, Tooltip } from '@mui/material';
import ImportChatworthyButton from './components/ImportChatworthyButton';
import { fetchJSON } from './lib/api';
import NoteAddIcon from '@mui/icons-material/NoteAdd';

// NEW: nav icons
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FlashOnOutlinedIcon from '@mui/icons-material/FlashOnOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import SettingsIcon from '@mui/icons-material/Settings';

import QuickCaptureDialog from './features/quickNotes/QuickCaptureDialog';
import SettingsDialog from './features/settings/SettingsDialog';

import ImportAiClassificationButton from './features/imports/ImportAiClassificationButton';

type TopNavButtonProps = {
  to: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
};

function TopNavButton({ to, children, icon }: TopNavButtonProps) {
  const match = useMatch({ path: to === '/' ? '/' : `${to}/*`, end: to === '/' });

  return (
    <Button
      component={Link}
      to={to}
      color="inherit"
      variant="text"
      aria-current={match ? 'page' : undefined}
      sx={(theme) => ({
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.06em',
        px: 2,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.12) },
        ...(match && { backgroundColor: alpha(theme.palette.common.white, 0.18) }), // active pill
      })}
    >
      {icon}
      {children}
    </Button>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const { subjectSlug, topicSlug } = useParams();
  const [qcOpen, setQcOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetchJSON<{ ok: boolean }>('/health')
      .then(x => console.log('Health:', x))
      .catch(err => console.error('Health failed:', err));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setQcOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // NOTE: isActive is unused now but keeping in case you re-use it later
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

          {/* Destinations */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mr: 1 }}>
            <TopNavButton to="/notes" icon={<DescriptionOutlinedIcon fontSize="small" />}>
              Notes
            </TopNavButton>
            <TopNavButton to="/quick-notes" icon={<FlashOnOutlinedIcon fontSize="small" />}>
              Quick Notes
            </TopNavButton>
            <TopNavButton to="/subjects/manage" icon={<CategoryOutlinedIcon fontSize="small" />}>
              Manage Hierarchy
            </TopNavButton>
            <TopNavButton to="/relations" icon={<HubOutlinedIcon fontSize="small" />}>
              Relations
            </TopNavButton>
          </Stack>

          {/* Actions */}
          <Stack direction="row" spacing={1} alignItems="center">
            {/* Existing Chatworthy import (file/zip) */}
            <ImportChatworthyButton mode="icon" />

            {/* NEW: AI classification import (seed + classification JSON) */}
            <ImportAiClassificationButton mode="icon" />

            {/* Quick Capture as an action icon */}
            <Tooltip title="Quick Capture (⌘/Ctrl+Shift+N)">
              <IconButton
                size="small"
                onClick={() => setQcOpen(true)}
                aria-label="Quick Capture"
                sx={(theme) => ({
                  borderRadius: 2,
                  backgroundColor: alpha(theme.palette.common.white, 0.18),
                  '&:hover': { backgroundColor: alpha(theme.palette.common.white, 0.28) },
                })}
              >
                <NoteAddIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Settings">
              <IconButton color="inherit" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>

          </Stack>
        </Toolbar>
      </AppBar>

      <QuickCaptureDialog open={qcOpen} onClose={() => setQcOpen(false)} />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

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
