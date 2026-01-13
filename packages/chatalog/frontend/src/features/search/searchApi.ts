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
import { buildLegacySearchUrl } from './buildSearchRequest';

export type RecipeFacetBucket = { value: string; count: number };
export type RecipeFacetsResponse = {
  cuisines: RecipeFacetBucket[];
  categories: RecipeFacetBucket[];
  keywords: RecipeFacetBucket[];
};

const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    legacyGetSearch: build.query<SearchResponse, SearchSpec>({
      query: (spec) => {
        const req = buildLegacySearchUrl(spec);
        return { url: req.url };
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
  // Intentionally not exporting legacyGetSearch hook anymore; Search UI must use POST v1.
  useSearchMutation,
  useGetRecipeFacetsQuery,
  useGetSavedSearchesQuery,
  useCreateSavedSearchMutation,
  useDeleteSavedSearchMutation,
} = searchApi;
