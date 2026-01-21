// chatalog/frontend/src/AppShell.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, Link, useLocation, useMatch, useNavigate, matchPath } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Stack, Box, alpha, IconButton, Tooltip } from '@mui/material';
import ImportChatworthyButton from './features/imports/ImportChatworthyButton';
import ImportPdfButton from './features/imports/ImportPdfButton';
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
import SearchBox from './components/SearchBox';
import { parseSearchInput } from './features/search/queryParser';
import { useAppDispatch, useAppSelector } from './store';
import { selectSearchDraft, selectSearchDraftText } from './features/search/searchSelectors';
import { hydrateFromUrl, setDraftText } from './features/search/searchSlice';
import { buildSearchUrlFromQuery } from './features/search/searchUrl';

import ImportAiClassificationButton from './features/imports/ImportAiClassificationButton';

type TopNavButtonProps = {
  to: string;
  children: ReactNode;
  icon?: ReactNode;
};

const takeObjectId = (slug?: string) => slug?.match(/^[a-f0-9]{24}/i)?.[0];

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
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const searchDraft = useAppSelector(selectSearchDraft);
  const searchDraftText = useAppSelector(selectSearchDraftText);
  const [qcOpen, setQcOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetchJSON<{ ok: boolean }>('/health')
      .then(x => console.log('Health:', x))
      .catch(err => console.error('Health failed:', err));
  }, []);

  const m =
    matchPath({ path: '/s/:subjectSlug/t/:topicSlug/n/:noteId-:noteSlug' }, pathname) ||
    matchPath({ path: '/s/:subjectSlug/t/:topicSlug/n/:noteId' }, pathname) ||
    matchPath({ path: '/s/:subjectSlug/t/:topicSlug' }, pathname);

  const subjectSlug = (m?.params as any)?.subjectSlug as string | undefined;
  const topicSlug = (m?.params as any)?.topicSlug as string | undefined;

  const goSearch = () => {
    const parsed = parseSearchInput(searchDraftText);
    const nextText = (parsed.q ?? '').trim();

    const scopeParam = (parsed.params.scope ?? '').trim().toLowerCase();
    const scope =
      scopeParam === 'recipes' || scopeParam === 'notes' || scopeParam === 'all'
        ? scopeParam
        : undefined;
    const effectiveScope = scope ?? searchDraft.scope ?? 'notes';

    const nextQuery = {
      ...searchDraft,
      text: nextText,
      ...(effectiveScope ? { scope: effectiveScope as any } : {}),
      filters: {
        ...searchDraft.filters,
        tags: parsed.params.tags
          ? parsed.params.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        status: parsed.params.status?.trim() || undefined,
        updatedFrom: parsed.params.updatedFrom?.trim() || undefined,
        updatedTo: parsed.params.updatedTo?.trim() || undefined,
      },
    };

    const subjectId = takeObjectId(subjectSlug);
    const topicId = takeObjectId(topicSlug);

    if (subjectId) nextQuery.filters.subjectId = subjectId;
    if (topicId) nextQuery.filters.topicId = topicId;

    dispatch(hydrateFromUrl(nextQuery));
    navigate(buildSearchUrlFromQuery(nextQuery));
  };

  return (
    <Box
      sx={{
        height: '100dvh',            // ⬅️ fixed to viewport height
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',          // ⬅️ no document-level scrollbar
      }}
    >
      <AppBar position="sticky" color="primary" enableColorOnDark>
        <Toolbar disableGutters sx={{ px: { xs: 1, sm: 1.5 } }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Chatalog
          </Typography>

          <SearchBox
            value={searchDraftText}
            onChange={(v) => dispatch(setDraftText(v))}
            onSubmit={goSearch}
            placeholder="Search…"
            sx={(theme) => ({
              ml: 2,
              width: 360,
              bgcolor: theme.palette.background.paper,
              borderRadius: 999,
              border: `1px solid ${theme.palette.divider}`,
            })}
          />

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
            <ImportPdfButton mode="icon" />

            {/* NEW: AI classification import (seed + classification JSON) */}
            <ImportAiClassificationButton mode="icon" />

            {/* Quick Capture as an action icon */}
            <Tooltip title="Quick Capture">
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
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,             // ⬅️ let children use full height
          overflow: 'hidden',       // ⬅️ pages manage their own scroll
          width: '100%',
          px: { xs: 1, sm: 1.5 },
          py: 3,
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
