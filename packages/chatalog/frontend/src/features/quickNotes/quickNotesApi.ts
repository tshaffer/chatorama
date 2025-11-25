import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import { chatalogApi as baseApi } from '../api/chatalogApi';

export type QuickNote = {
  id: string;
  title: string;
  markdown: string;
  subjectId?: string;
  topicId?: string;
  createdAt: string;
  updatedAt: string;
};

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
  useAddQuickNoteMutation,
  useUpdateQuickNoteMutation,
  useDeleteQuickNoteMutation,
  useConvertQuickNoteMutation,
} = quickNotesApi;
