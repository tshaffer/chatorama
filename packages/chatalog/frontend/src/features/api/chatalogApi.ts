// src/features/api/chatalogApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE } from '../../lib/apiBase';

export const chatalogApi = createApi({
  reducerPath: 'chatalogApi',
  baseQuery: fetchBaseQuery({ baseUrl: API_BASE || '' }), // same-origin if ''
  tagTypes: [
    'Subject',
    'Topic',
    'Note',
    'NoteAsset',
    'SubjectTopics',
    'QuickNote',
    'QuickNoteAsset',
    'TopicNotes',
    'ImportBatch',
    'SavedSearch',
    'GoogleDocStatus',
  ],
  endpoints: () => ({}), // no queries/mutations here — use injectEndpoints elsewhere
});
