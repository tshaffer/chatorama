// chatalog/frontend/src/TmpShell.tsx
import { AppBar, Toolbar, Typography, Box } from '@mui/material';

export default function TmpShell() {
  // flip between test0 and test1 as needed
  const test: number = 1;

  return (
    <Box
      id="tmpShell"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <AppBar position="sticky" color="primary" enableColorOnDark>
        <Toolbar disableGutters sx={{ px: { xs: 1, sm: 1.5 } }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Chatalog
          </Typography>
        </Toolbar>
      </AppBar>

      {test === 0 && (
        <Box
          id="test0"
          sx={{
            flex: 1,
            minHeight: 0,
            px: { xs: 1, sm: 1.5 },
            py: 2,
            overflowY: 'auto',
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
            flex: 1,
            minHeight: 0,
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
            }}
          >
            Fixed 64px header (test1)
          </Box>

          <Box
            id='scrollableFill'
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
            }}
          >
            <Box sx={{ height: 1200 }}>
              Scrollable fill area (test1)
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
