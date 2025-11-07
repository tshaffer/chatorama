// frontend/src/features/api/chatalogApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const API_BASE =
  (process.env.CHATALOG_API_BASE as string | undefined) ?? '/api/v1';

export const chatalogApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE,
    // Same-origin when the frontend is served by the backend (8080);
    // switch to 'include' if you later host frontend on a different origin.
    credentials: 'same-origin',
  }),
  tagTypes: ['Subject', 'Topic', 'Note'],
  endpoints: () => ({}),
});
