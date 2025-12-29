import { chatalogApi as baseApi } from '../api/chatalogApi';
import type { QuickNote, QuickNoteAsset } from '../../types/entities';

type ListParams = {
  q?: string;
  subjectId?: string;
  topicId?: string;
  limit?: number;
};

export const quickNotesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getQuickNotes: build.query<QuickNote[], ListParams | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args?.q) params.set('q', args.q);
        if (args?.subjectId) params.set('subjectId', args.subjectId);
        if (args?.topicId) params.set('topicId', args.topicId);
        if (args?.limit) params.set('limit', String(args.limit));
        const qs = params.toString();
        return { url: `quicknotes${qs ? `?${qs}` : ''}` };
      },
      providesTags: (res) =>
        res
          ? [{ type: 'QuickNote' as const, id: 'LIST' }, ...res.map(n => ({ type: 'QuickNote' as const, id: n.id }))]
          : [{ type: 'QuickNote' as const, id: 'LIST' }],
    }),

    getQuickNoteAssets: build.query<QuickNoteAsset[], string>({
      query: (quickNoteId) => ({
        url: `quickNoteAssets?quickNoteId=${quickNoteId}`,
      }),
      providesTags: (res, _err, quickNoteId) =>
        res
          ? [
              { type: 'QuickNoteAsset' as const, id: `LIST:${quickNoteId}` },
              ...res.map((asset) => ({ type: 'QuickNoteAsset' as const, id: asset.id })),
            ]
          : [{ type: 'QuickNoteAsset' as const, id: `LIST:${quickNoteId}` }],
    }),

    addQuickNoteAsset: build.mutation<
      QuickNoteAsset,
      { quickNoteId: string; assetId: string; caption?: string; order?: number }
    >({
      query: (body) => ({
        url: 'quickNoteAssets',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { quickNoteId }) => [
        { type: 'QuickNoteAsset' as const, id: `LIST:${quickNoteId}` },
      ],
    }),

    updateQuickNoteAsset: build.mutation<
      QuickNoteAsset,
      { id: string; caption?: string; order?: number; quickNoteId: string }
    >({
      query: ({ id, quickNoteId: _quickNoteId, ...patch }) => ({
        url: `quickNoteAssets/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_res, _err, { id, quickNoteId }) => [
        { type: 'QuickNoteAsset' as const, id },
        { type: 'QuickNoteAsset' as const, id: `LIST:${quickNoteId}` },
      ],
    }),

    deleteQuickNoteAsset: build.mutation<{ ok: true } | void, { id: string; quickNoteId: string }>({
      query: ({ id }) => ({ url: `quickNoteAssets/${id}`, method: 'DELETE' }),
      invalidatesTags: (_res, _err, { id, quickNoteId }) => [
        { type: 'QuickNoteAsset' as const, id },
        { type: 'QuickNoteAsset' as const, id: `LIST:${quickNoteId}` },
      ],
    }),

    addQuickNote: build.mutation<QuickNote, Partial<QuickNote>>({
      query: (body) => ({
        url: 'quicknotes',
        method: 'POST',
        body: {
          title: body.title,
          markdown: body.markdown,
          subjectId: body.subjectId,
          topicId: body.topicId,
        },
      }),
      invalidatesTags: [{ type: 'QuickNote', id: 'LIST' }],
    }),

    updateQuickNote: build.mutation<QuickNote, { id: string } & Partial<QuickNote>>({
      query: ({ id, ...patch }) => ({
        url: `quicknotes/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_res, _err, arg) => [
        { type: 'QuickNote', id: arg.id },
        { type: 'QuickNote', id: 'LIST' },
      ],
    }),

    deleteQuickNote: build.mutation<{ id: string; deleted: true }, string>({
      query: (id) => ({ url: `quicknotes/${id}`, method: 'DELETE' }),
      invalidatesTags: (_res, _err, id) => [
        { type: 'QuickNote', id },
        { type: 'QuickNote', id: 'LIST' },
      ],
    }),

    // adjust this type:
    convertQuickNote: build.mutation<{ noteId: string }, { id: string; subjectLabel?: string; topicLabel?: string }>({
      query: ({ id, subjectLabel, topicLabel }) => ({
        url: `quicknotes/${id}/convert`,
        method: 'POST',
        body: { subjectLabel, topicLabel },
      }),
      invalidatesTags: [{ type: 'QuickNote', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetQuickNotesQuery,
  useGetQuickNoteAssetsQuery,
  useAddQuickNoteAssetMutation,
  useUpdateQuickNoteAssetMutation,
  useDeleteQuickNoteAssetMutation,
  useAddQuickNoteMutation,
  useUpdateQuickNoteMutation,
  useDeleteQuickNoteMutation,
  useConvertQuickNoteMutation,
} = quickNotesApi;
