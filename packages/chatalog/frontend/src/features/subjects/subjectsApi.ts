// frontend/src/features/subjects/subjectsApi.ts
import type { Subject, Topic, NotePreview } from '@chatorama/chatalog-shared';
import { chatalogApi as baseApi } from '../api/chatalogApi';

const safeId = (o: { id?: string } | undefined) => o?.id ?? '';

export const subjectsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSubjects: build.query<Subject[], void>({
      query: () => ({ url: 'subjects' }),
      providesTags: (res) =>
        res
          ? [{ type: 'Subject' as const, id: 'LIST' }, ...res.map(s => ({ type: 'Subject' as const, id: safeId(s as any) }))]
          : [{ type: 'Subject' as const, id: 'LIST' }],
    }),

    getTopicsForSubject: build.query<Topic[], string>({
      query: (subjectId) => ({ url: `subjects/${subjectId}/topics` }),
      // NOTE: third param is the original query arg (subjectId)
      providesTags: (res, _err, subjectId) => {
        const listTag = { type: 'Topic' as const, id: `LIST:${subjectId}` };
        if (!res) return [listTag];
        return [
          listTag,
          ...res.map((t) => ({ type: 'Topic' as const, id: safeId(t as any) })),
        ];
      },
    }),

    getNotePreviewsForTopic: build.query<NotePreview[], { subjectId: string; topicId: string }>({
      query: ({ subjectId, topicId }) => ({ url: `subjects/${subjectId}/topics/${topicId}/notes` }),
      providesTags: (res) =>
        res
          ? [{ type: 'Note' as const, id: 'LIST' }, ...res.map(n => ({ type: 'Note' as const, id: safeId(n as any) }))]
          : [{ type: 'Note' as const, id: 'LIST' }],
    }),

    createSubject: build.mutation<Subject, { name: string }>({
      query: (body) => ({ url: 'subjects', method: 'POST', body }),
      invalidatesTags: [{ type: 'Subject', id: 'LIST' }],
    }),

    deleteSubject: build.mutation<void, { subjectId: string }>({
      query: ({ subjectId }) => ({ url: `subjects/${subjectId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { subjectId }) => [
        { type: 'Subject', id: 'LIST' },
        { type: 'Subject', id: subjectId },
        // also nuke this subject’s topic list
        { type: 'Topic', id: `LIST:${subjectId}` },
      ],
    }),

    renameSubject: build.mutation<
      Subject,
      { subjectId: string; name: string; preserveSlug?: boolean }>({
        query: ({ subjectId, name, preserveSlug }) => ({
          url: `subjects/${subjectId}${preserveSlug ? '?preserveSlug=1' : ''}`,
          method: 'PATCH',
          body: { name },
        }),
        async onQueryStarted({ subjectId, name }, { dispatch, queryFulfilled }) {
          // Use subjectsApi.util, not baseApi.util
          const patch = dispatch(
            subjectsApi.util.updateQueryData('getSubjects', undefined, (draft: Subject[]) => {
              const s = draft.find(d => d.id === subjectId);
              if (s) s.name = name;
            })
          );
          try {
            await queryFulfilled;
          } catch {
            patch.undo();
          }
        },
        invalidatesTags: (_r, _e, { subjectId }) => [{ type: 'Subject', id: subjectId }],
      }),

    createTopic: build.mutation<Topic, { subjectId: string; name: string }>({
      query: ({ subjectId, name }) => ({
        url: `subjects/${subjectId}/topics`,
        method: 'POST',
        body: { name },
      }),
      invalidatesTags: (_r, _e, { subjectId }) => [
        { type: 'Topic', id: `LIST:${subjectId}` },
      ],
    }),

    deleteTopic: build.mutation<void, { subjectId: string; topicId: string }>({
      query: ({ subjectId, topicId }) => ({
        url: `subjects/${subjectId}/topics/${topicId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { subjectId, topicId }) => [
        { type: 'Topic', id: `LIST:${subjectId}` },
        { type: 'Topic', id: topicId },
      ],
    }),

    renameTopic: build.mutation<
      Topic,
      { subjectId: string; topicId: string; name: string; preserveSlug?: boolean }
    >({
      query: ({ subjectId, topicId, name, preserveSlug }) => ({
        url: `subjects/${subjectId}/topics/${topicId}${preserveSlug ? '?preserveSlug=1' : ''}`,
        method: 'PATCH',
        body: { name },
      }),
      async onQueryStarted({ subjectId, topicId, name }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          subjectsApi.util.updateQueryData('getTopicsForSubject', subjectId, (draft: Topic[]) => {
            const t = draft.find(d => d.id === topicId);
            if (t) t.name = name;
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_r, _e, { topicId }) => [{ type: 'Topic', id: topicId }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetSubjectsQuery,
  useGetTopicsForSubjectQuery,
  useGetNotePreviewsForTopicQuery,
  useCreateSubjectMutation,
  useDeleteSubjectMutation,
  useCreateTopicMutation,
  useDeleteTopicMutation,
  useRenameSubjectMutation,
  useRenameTopicMutation,
} = subjectsApi;
