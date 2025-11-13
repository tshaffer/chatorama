// frontend/src/features/topics/topicsApi.ts
import type { Topic } from '@chatorama/chatalog-shared';
import { chatalogApi as baseApi } from '../api/chatalogApi';

export const topicsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAllTopics: build.query<Topic[], void>({
      query: () => ({ url: 'topics' }),
      providesTags: (res) =>
        res
          ? [
              { type: 'Topic' as const, id: 'LIST' },
              ...res.map(t => ({ type: 'Topic' as const, id: t.id })),
            ]
          : [{ type: 'Topic' as const, id: 'LIST' }],
    }),
  }),
  overrideExisting: false,
});

export const { useGetAllTopicsQuery } = topicsApi;
