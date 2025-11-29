// chatalog/frontend/src/TmpShell.tsx
import { AppBar, Toolbar, Typography, Box, CssBaseline } from '@mui/material';

export default function TmpShell() {
  // flip between test0 and test1 as needed
  const test: number = 1;

  // Key principle: The page itself doesn't scroll.
  // The content below the AppBar fills the rest of the height and manages its own internal scrolling.
  return (
    <>
      <CssBaseline />
      <Box
        id="tmpShell"
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          // Ensure the main app container is the only thing taking up the screen height
          // and does not introduce a main page scrollbar.
          overflow: 'hidden',
        }}
      >
        <AppBar position="static" color="primary" enableColorOnDark>
          <Toolbar disableGutters sx={{ px: { xs: 1, sm: 1.5 } }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Chatalog
            </Typography>
          </Toolbar>
        </AppBar>

        {/* The main content area below the AppBar - this flex item fills the remaining vertical space */}
        {test === 0 && (
          <Box
            id="test0"
            sx={{
              flex: 1,
              minHeight: 0, // Crucial for flex item sizing
              px: { xs: 1, sm: 1.5 },
              py: 2,
              overflowY: 'auto', // This makes the entire main content area scrollable
              overflowX: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ height: 1200, border: '1px dashed', borderColor: 'divider', p: 2 }}>
              Scrollable content (test0)
            </Box>
          </Box>
        )}

        {test === 1 && (
          <Box
            id="test1"
            sx={{
              flex: 1, // Fills the rest of the vertical height in #tmpShell
              minHeight: 0, // Prevents flex item from growing past container height
              px: { xs: 1, sm: 1.5 },
              py: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Box
              id='fixedHeader'
              sx={{
                height: 64,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                px: 2,
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0, // Prevents this fixed header from shrinking
              }}
            >
              Fixed 64px header (test1)
            </Box>

            <Box
              id='scrollableFill'
              sx={{
                flex: 1, // Takes all remaining space below fixedHeader
                minHeight: 0, // Ensures overflowY: 'auto' works correctly
                overflowY: 'auto',
                overflowX: 'hidden',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
              }}
            >
              <Box sx={{ height: 1200 }}>
                {/* Content that drives the scrolling within the scrollableFill div */}
                Scrollable fill area (test1)
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
}
