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
  maxPrepMinutes?: number;
  maxCookMinutes?: number;
  maxTotalMinutes?: number;
  cuisine?: string;
  category?: string;
  keywords?: string;
  includeIngredients?: string;
  excludeIngredients?: string;
};

export type RecipeFacetBucket = { value: string; count: number };
export type RecipeFacetsResponse = {
  cuisines: RecipeFacetBucket[];
  categories: RecipeFacetBucket[];
  keywords: RecipeFacetBucket[];
};

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSearch: build.query<SearchResponse, GetSearchArgs>({
      query: ({
        q,
        mode,
        limit,
        scope,
        subjectId,
        topicId,
        minSemanticScore,
        maxPrepMinutes,
        maxCookMinutes,
        maxTotalMinutes,
        cuisine,
        category,
        keywords,
        includeIngredients,
        excludeIngredients,
      }) => {
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
        if (Number.isFinite(maxPrepMinutes as any)) {
          params.set('maxPrepMinutes', String(maxPrepMinutes));
        }
        if (Number.isFinite(maxCookMinutes as any)) {
          params.set('maxCookMinutes', String(maxCookMinutes));
        }
        if (Number.isFinite(maxTotalMinutes as any)) {
          params.set('maxTotalMinutes', String(maxTotalMinutes));
        }
        if (cuisine && cuisine.trim()) params.set('cuisine', cuisine.trim());
        if (category && category.trim()) params.set('category', category.trim());
        if (keywords && keywords.trim()) params.set('keywords', keywords.trim());
        if (includeIngredients && includeIngredients.trim()) {
          params.set('includeIngredients', includeIngredients.trim());
        }
        if (excludeIngredients && excludeIngredients.trim()) {
          params.set('excludeIngredients', excludeIngredients.trim());
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
    getRecipeFacets: build.query<RecipeFacetsResponse, void>({
      query: () => ({ url: 'recipes/facets' }),
    }),
  }),
});

export const { useGetSearchQuery, useSearchMutation, useGetRecipeFacetsQuery } = searchApi;
