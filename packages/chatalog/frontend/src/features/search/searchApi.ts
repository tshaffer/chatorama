import { chatalogApi as baseApi } from '../api/chatalogApi';
import type {
  SearchMode,
  SearchRequestV1,
  SearchResponse,
  SearchResponseV1,
} from '@chatorama/chatalog-shared';

export type GetSearchArgs = {
  q: string;
  mode?: SearchMode;
  limit?: number;
  scope?: 'all' | 'recipes' | 'notes';
  subjectId?: string;
  topicId?: string;
  minSemanticScore?: number;
};

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSearch: build.query<SearchResponse, GetSearchArgs>({
      query: ({ q, mode, limit, scope, subjectId, topicId, minSemanticScore }) => {
        const params = new URLSearchParams();
        params.set('q', q);
        if (mode) params.set('mode', mode);
        if (limit != null) params.set('limit', String(limit));
        if (scope && scope !== 'all') params.set('scope', scope);
        if (subjectId) params.set('subjectId', subjectId);
        if (topicId) params.set('topicId', topicId);
        if (minSemanticScore != null) {
          params.set('minSemanticScore', String(minSemanticScore));
        }

        return { url: `search?${params.toString()}` };
      },
    }),
    search: build.mutation<SearchResponseV1, SearchRequestV1>({
      query: (body) => ({
        url: 'search',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { useGetSearchQuery, useSearchMutation } = searchApi;
