// src/lib/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { API_BASE } from './apiBase';
import type { Subject } from '@chatorama/chatalog-shared';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: API_BASE }),
  endpoints: (build) => ({
    getSubjects: build.query<Subject[], void>({
      query: () => 'subjects',
    }),
  }),
});

export const { useGetSubjectsQuery } = api;