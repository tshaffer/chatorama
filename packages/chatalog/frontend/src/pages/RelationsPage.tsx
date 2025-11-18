import React from 'react';
import { Box, Typography } from '@mui/material';

export default function RelationsPage() {
  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Typography variant="h4" gutterBottom>
        Relations
      </Typography>
      <Typography variant="body1" color="text.secondary">
        This page will show relationships between notes, topics, and subjects — including backlinks,
        cross-topic links, and other connections in your knowledge graph.
      </Typography>
    </Box>
  );
}
