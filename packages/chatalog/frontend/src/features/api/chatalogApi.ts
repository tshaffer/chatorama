import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const chatalogApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    credentials: 'same-origin',
  }),
  tagTypes: ['Subject', 'Topic', 'Note'],
  endpoints: () => ({}),
});
