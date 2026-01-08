import { chatalogApi as baseApi } from '../api/chatalogApi';
import type {
  SavedSearch,
  SearchSpec,
  ListSavedSearchesResponse,
  CreateSavedSearchRequest,
  CreateSavedSearchResponse,
  DeleteSavedSearchResponse,
  SearchRequestV1,
  SearchResponse,
  SearchResponseV1,
} from '@chatorama/chatalog-shared';

export type RecipeFacetBucket = { value: string; count: number };
export type RecipeFacetsResponse = {
  cuisines: RecipeFacetBucket[];
  categories: RecipeFacetBucket[];
  keywords: RecipeFacetBucket[];
};

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSearch: build.query<SearchResponse, SearchSpec>({
      query: (spec) => {
        const params = new URLSearchParams();
        params.set('q', spec.query);
        if (spec.mode) params.set('mode', spec.mode);
        if (spec.limit != null) params.set('limit', String(spec.limit));
        if (spec.scope && spec.scope !== 'all') params.set('scope', spec.scope);
        if (spec.filters.subjectId) params.set('subjectId', spec.filters.subjectId);
        if (spec.filters.topicId) params.set('topicId', spec.filters.topicId);
        if (spec.filters.minSemanticScore != null) {
          params.set('minSemanticScore', String(spec.filters.minSemanticScore));
        }
        if (Number.isFinite(spec.filters.prepTimeMax as any)) {
          params.set('maxPrepMinutes', String(spec.filters.prepTimeMax));
        }
        if (Number.isFinite(spec.filters.cookTimeMax as any)) {
          params.set('maxCookMinutes', String(spec.filters.cookTimeMax));
        }
        if (Number.isFinite(spec.filters.totalTimeMax as any)) {
          params.set('maxTotalMinutes', String(spec.filters.totalTimeMax));
        }
        const cuisine = spec.filters.cuisine?.slice().sort((a, b) => a.localeCompare(b));
        const category = spec.filters.category?.slice().sort((a, b) => a.localeCompare(b));
        const keywords = spec.filters.keywords?.slice().sort((a, b) => a.localeCompare(b));
        const includeIngredients = spec.filters.includeIngredients
          ?.slice()
          .sort((a, b) => a.localeCompare(b));
        const excludeIngredients = spec.filters.excludeIngredients
          ?.slice()
          .sort((a, b) => a.localeCompare(b));

        if (cuisine?.length) params.set('cuisine', cuisine.join(','));
        if (category?.length) params.set('category', category.join(','));
        if (keywords?.length) params.set('keywords', keywords.join(','));
        if (includeIngredients?.length) {
          params.set('includeIngredients', includeIngredients.join(','));
        }
        if (excludeIngredients?.length) {
          params.set('excludeIngredients', excludeIngredients.join(','));
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
    getSavedSearches: build.query<ListSavedSearchesResponse, void>({
      query: () => ({ url: 'saved-searches' }),
      providesTags: (res) =>
        res?.items
          ? [
              { type: 'SavedSearch' as const, id: 'LIST' },
              ...res.items.map((x: SavedSearch) => ({ type: 'SavedSearch' as const, id: x.id })),
            ]
          : [{ type: 'SavedSearch' as const, id: 'LIST' }],
    }),
    createSavedSearch: build.mutation<CreateSavedSearchResponse, CreateSavedSearchRequest>({
      query: (body) => ({ url: 'saved-searches', method: 'POST', body }),
      invalidatesTags: [{ type: 'SavedSearch' as const, id: 'LIST' }],
    }),
    deleteSavedSearch: build.mutation<DeleteSavedSearchResponse, string>({
      query: (id) => ({ url: `saved-searches/${id}`, method: 'DELETE' }),
      invalidatesTags: (_res, _err, id) => [
        { type: 'SavedSearch' as const, id: 'LIST' },
        { type: 'SavedSearch' as const, id },
      ],
    }),
  }),
});

export const {
  useGetSearchQuery,
  useSearchMutation,
  useGetRecipeFacetsQuery,
  useGetSavedSearchesQuery,
  useCreateSavedSearchMutation,
  useDeleteSavedSearchMutation,
} = searchApi;
