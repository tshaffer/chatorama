import { chatalogApi as baseApi } from '../api/chatalogApi';
import type { SearchRequestV1, SearchResponseV1 } from '@chatorama/chatalog-shared';

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    search: build.mutation<SearchResponseV1, SearchRequestV1>({
      query: (body) => ({
        url: 'search',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { useSearchMutation } = searchApi;
