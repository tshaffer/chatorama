// frontend/src/features/subjects/subjectsApi.ts
import type {
  Subject,
  Topic,
  Note,
  SubjectRelationsSummary,
  TopicRelationsSummary,
} from '@chatorama/chatalog-shared';
import { chatalogApi as baseApi } from '../api/chatalogApi';

const safeId = (o: { id?: string } | undefined) => o?.id ?? '';

export const subjectsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSubjects: build.query<Subject[], void>({
      query: () => ({ url: 'subjects' }),
      providesTags: (res) =>
        res
          ? [
            { type: 'Subject' as const, id: 'LIST' },
            ...res.map((s) => ({
              type: 'Subject' as const,
              id: safeId(s as any),
            })),
          ]
          : [{ type: 'Subject' as const, id: 'LIST' }],
    }),

    getSubjectsWithTopics: build.query<(Subject & { topics: Topic[] })[], void>({
      query: () => ({ url: 'subjects/with-topics' }),
      providesTags: (res) =>
        res
          ? [
            { type: 'Subject' as const, id: 'LIST' },
            ...res.map((s) => ({
              type: 'Subject' as const,
              id: safeId(s as any),
            })),
          ]
          : [{ type: 'Subject' as const, id: 'LIST' }],
    }),

    getTopicsForSubject: build.query<Topic[], string>({
      query: (subjectId) => ({ url: `subjects/${subjectId}/topics` }),
      providesTags: (res, _err, subjectId) => {
        const listTag = { type: 'Topic' as const, id: `LIST:${subjectId}` };
        if (!res) return [listTag];
        return [
          listTag,
          ...res.map((t) => ({ type: 'Topic' as const, id: safeId(t as any) })),
        ];
      },
    }),

    getNotePreviewsForTopic: build.query<
      Note[],
      { subjectId: string; topicId: string }
    >({
      query: ({ subjectId, topicId }) => ({
        url: `subjects/${subjectId}/topics/${topicId}/notes`,
      }),
      providesTags: (res, _err, { subjectId, topicId }) => [
        { type: 'TopicNotes', id: `${subjectId}:${topicId}` },
        ...(res ?? []).map((n) => ({ type: 'Note' as const, id: n.id })),
      ],
    }),

    getSubjectRelationsSummary: build.query<SubjectRelationsSummary, string>({
      query: (subjectId) => ({
        url: `subjects/${subjectId}/relations-summary`,
      }),
      providesTags: (_res, _err, subjectId) => [
        { type: 'Subject' as const, id: `REL:${subjectId}` },
      ],
    }),

    getTopicRelationsSummary: build.query<
      TopicRelationsSummary,
      { subjectId: string; topicId: string }
    >({
      query: ({ subjectId, topicId }) => ({
        url: `subjects/${subjectId}/topics/${topicId}/relations-summary`,
      }),
      providesTags: (_res, _err, { subjectId, topicId }) => [
        { type: 'Topic' as const, id: `REL:${subjectId}:${topicId}` },
      ],
    }),

    getTopicNoteCount: build.query<{ topicId: string; noteCount: number }, string>({
      query: (topicId) => ({
        url: `topics/${topicId}/note-count`,
        method: 'GET',
      }),
    }),

    createSubject: build.mutation<Subject, { name: string }>({
      query: (body) => ({ url: 'subjects', method: 'POST', body }),
      invalidatesTags: [{ type: 'Subject', id: 'LIST' }],
    }),

    deleteSubject: build.mutation<void, { subjectId: string }>({
      query: ({ subjectId }) => ({
        url: `subjects/${subjectId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { subjectId }) => [
        { type: 'Subject', id: 'LIST' },
        { type: 'Subject', id: subjectId },
        { type: 'Topic', id: `LIST:${subjectId}` },
      ],
    }),

    renameSubject: build.mutation<
      Subject,
      { subjectId: string; name: string; preserveSlug?: boolean }
    >({
      query: ({ subjectId, name, preserveSlug }) => ({
        url: `subjects/${subjectId}${preserveSlug ? '?preserveSlug=1' : ''}`,
        method: 'PATCH',
        body: { name },
      }),
      async onQueryStarted({ subjectId, name }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          subjectsApi.util.updateQueryData(
            'getSubjects',
            undefined,
            (draft: Subject[]) => {
              const s = draft.find((d) => d.id === subjectId);
              if (s) s.name = name;
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_r, _e, { subjectId }) => [
        { type: 'Subject', id: subjectId },
      ],
    }),

    /** NEW: reorder subjects (global order) */
    reorderSubjects: build.mutation<void, { orderedIds: string[] }>({
      query: ({ orderedIds }) => ({
        url: 'subjects/reorder',
        method: 'PATCH',
        body: { orderedIds },
      }),
      // subjects order only affects getSubjects()
      invalidatesTags: [{ type: 'Subject', id: 'LIST' }],
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

    deleteTopic: build.mutation<void, { subjectId: string; topicId: string }>(
      {
        query: ({ subjectId, topicId }) => ({
          url: `subjects/${subjectId}/topics/${topicId}`,
          method: 'DELETE',
        }),
        invalidatesTags: (_r, _e, { subjectId, topicId }) => [
          { type: 'Topic', id: `LIST:${subjectId}` },
          { type: 'Topic', id: topicId },
        ],
      },
    ),

    renameTopic: build.mutation<
      Topic,
      { subjectId: string; topicId: string; name: string; preserveSlug?: boolean }
    >({
      query: ({ subjectId, topicId, name, preserveSlug }) => ({
        url: `subjects/${subjectId}/topics/${topicId}${preserveSlug ? '?preserveSlug=1' : ''
          }`,
        method: 'PATCH',
        body: { name },
      }),
      async onQueryStarted(
        { subjectId, topicId, name },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          subjectsApi.util.updateQueryData(
            'getTopicsForSubject',
            subjectId,
            (draft: Topic[]) => {
              const t = draft.find((d) => d.id === topicId);
              if (t) t.name = name;
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_r, _e, { topicId }) => [
        { type: 'Topic', id: topicId },
      ],
    }),

    /** NEW: reorder topics within a subject */
    reorderTopics: build.mutation<
      void,
      { subjectId: string; orderedTopicIds: string[] }
    >({
      query: ({ subjectId, orderedTopicIds }) => ({
        url: `subjects/${subjectId}/topics/reorder`,
        method: 'PATCH',
        body: { orderedTopicIds },
      }),
      invalidatesTags: (_r, _e, { subjectId }) => [
        { type: 'Topic', id: `LIST:${subjectId}` },
      ],
    }),
  }),
  overrideExisting: true,
});

export function resolveSubjectAndTopicNames(
  subjects: (Subject & { topics: Topic[] })[] | undefined,
  subjectId?: string,
  topicId?: string,
): { subjectName?: string; topicName?: string } {
  if (!subjects) return {};

  const subject = subjectId
    ? subjects.find((s) => safeId(s as any) === subjectId)
    : undefined;

  const topic =
    topicId && subjects
      ? subjects
        .flatMap((s) => s.topics?.map((t) => ({ ...t, subjectId: safeId(s as any) })) || [])
        .find((t) => safeId(t as any) === topicId)
      : undefined;

  return {
    subjectName: subject?.name,
    topicName: topic?.name,
  };
}

export const {
  useGetSubjectsQuery,
  useGetSubjectsWithTopicsQuery,
  useGetTopicsForSubjectQuery,
  useCreateSubjectMutation,
  useDeleteSubjectMutation,
  useCreateTopicMutation,
  useDeleteTopicMutation,
  useRenameSubjectMutation,
  useRenameTopicMutation,
  useGetSubjectRelationsSummaryQuery,
  useGetTopicRelationsSummaryQuery,
  useGetTopicNoteCountQuery,
  useReorderSubjectsMutation,
  useReorderTopicsMutation,
} = subjectsApi;
