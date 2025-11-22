// frontend/src/features/notes/notesApi.ts
import type {
  Note,
  NotePreview,
  ReorderNotesRequest,
  MoveNotesPayload,
  MoveNotesResult,
  TopicNotesWithRelations,
} from '@chatorama/chatalog-shared';
import { chatalogApi as baseApi } from '../api/chatalogApi';
import { subjectsApi } from '../subjects/subjectsApi';

type CreateNoteRequest = Partial<
  Pick<Note, 'subjectId' | 'topicId' | 'title' | 'markdown' | 'summary' | 'tags' | 'relations'>
>;
type UpdateNoteRequest = {
  noteId: string;
  patch: Partial<
    Pick<Note, 'title' | 'markdown' | 'summary' | 'tags' | 'links' | 'relations'>
  >;
};
type DeleteNoteRequest = { noteId: string };

export const notesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNote: build.query<Note, string>({
      query: (noteId) => ({ url: `notes/${noteId}` }),
      providesTags: (_res, _err, noteId) => [{ type: 'Note', id: noteId }],
    }),

    getTopicNotesWithRelations: build.query<
      TopicNotesWithRelations,
      { subjectId: string; topicId: string }
    >({
      query: ({ subjectId, topicId }) => ({
        url: `notes/by-topic-with-relations`,
        params: { subjectId, topicId },
      }),
      providesTags: (res, _err, { subjectId, topicId }) => {
        // Base tag for this topic's list
        const baseTag = {
          type: 'Note' as const,
          id: `LIST:${subjectId}:${topicId}`,
        };

        if (!res) {
          return [baseTag];
        }

        // Collect all notes that appear in this payload
        const allNotes = [
          ...(res.notes ?? []),
          ...(res.relatedTopicNotes ?? []),
          ...(res.relatedSubjectNotes ?? []),
          ...(res.relatedDirectNotes ?? []),
        ];

        // One tag per note id
        const seen = new Set<string>();
        const noteTags = allNotes
          .filter((n) => n.id && !seen.has(n.id))
          .map((n) => {
            seen.add(n.id);
            return { type: 'Note' as const, id: n.id };
          });

        return [baseTag, ...noteTags];
      },
    }),

    getAllNotesForRelations: build.query<NotePreview[], void>({
      query: () => ({ url: 'notes' }), // listNotes with no filters
      providesTags: (res) =>
        res
          ? [
            { type: 'Note' as const, id: 'REL-LIST' },
            ...res.map(n => ({ type: 'Note' as const, id: n.id })),
          ]
          : [{ type: 'Note' as const, id: 'REL-LIST' }],
    }),

    createNote: build.mutation<Note, CreateNoteRequest>({
      query: (body) => ({ url: 'notes', method: 'POST', body }),
      // If you want to specifically invalidate the new topic list when subjectId/topicId are present:
      invalidatesTags: (res, _err, body) => {
        const tags = [{ type: 'Note' as const, id: 'LIST' }];
        if (body?.subjectId && body?.topicId) {
          tags.push({
            type: 'Note' as const,
            id: `LIST:${body.subjectId}:${body.topicId}`,
          });
        }
        return tags;
      },
    }),

    updateNote: build.mutation<Note, UpdateNoteRequest>({
      query: ({ noteId, patch }) => ({
        url: `notes/${noteId}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (_res, _err, { noteId }) => [
        { type: 'Note', id: noteId },
        { type: 'Note', id: 'LIST' },
      ],
    }),

    // ← UPDATED: now requires subjectId to target the correct cache entry
    reorderNotesInTopic: build.mutation<
      { ok: true },
      { subjectId: string; topicId: string; noteIdsInOrder: string[] }
    >({
      query: ({ subjectId, topicId, noteIdsInOrder }) => ({
        url: `subjects/${subjectId}/topics/${topicId}/notes/reorder`,
        method: 'PATCH',
        body: { noteIdsInOrder } satisfies ReorderNotesRequest,
      }),
      async onQueryStarted(
        { subjectId, topicId, noteIdsInOrder },
        { dispatch, queryFulfilled },
      ) {
        // Optimistically reorder the NotePreview[] in subjectsApi.getNotePreviewsForTopic cache
        const patch = dispatch(
          subjectsApi.util.updateQueryData(
            'getNotePreviewsForTopic',
            { subjectId, topicId },
            (draft: any[]) => {
              const byId = new Map(draft.map((n) => [n.id ?? n._id, n]));
              const reordered = noteIdsInOrder
                .map((id) => byId.get(id))
                .filter(Boolean);
              if (reordered.length === draft.length) {
                reordered.forEach((n, idx) => {
                  (n as any).order = idx;
                });
                // Replace array contents in-place (immer draft)
                draft.length = 0;
                draft.push(...reordered);
              }
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_res, _err, { subjectId, topicId }) => [
        { type: 'Note' as const, id: `LIST:${subjectId}:${topicId}` },
      ],
    }),

    deleteNote: build.mutation<{ ok: true } | void, DeleteNoteRequest>({
      query: ({ noteId }) => ({ url: `notes/${noteId}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Note', id: 'LIST' }],
    }),

    moveNotes: build.mutation<MoveNotesResult, MoveNotesPayload>({
      query: (body) => ({
        url: 'notes:move',
        method: 'POST',
        body,
      }),
      // 🔁 Cache strategy:
      // invalidate source & dest note lists and their topic summaries
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        const { noteIds, dest } = arg;
        const patchUps: Array<() => void> = [];

        try {
          // Keep it robust & simple: rely on invalidations after success.
          await queryFulfilled;

          // After success, proactively invalidate the impacted lists:
          dispatch(
            baseApi.util.invalidateTags([
              // If you tag Note by id elsewhere:
              ...noteIds.map((id) => ({ type: 'Note' as const, id })),
              // If you tag topic lists:
              { type: 'TopicNotes' as const, id: `${dest.subjectId}:${dest.topicId}` },
            ]),
          );
        } catch {
          // rollback optimistic changes if any
          for (const undo of patchUps) undo();
        }
      },
      // If you prefer tag-based invalidation instead of the manual call above:
      // invalidatesTags: (res, err, { noteIds, dest }) => [
      //   ...noteIds.map(id => ({ type: 'Note' as const, id })),
      //   { type: 'TopicNotes' as const, id: `${dest.subjectId}:${dest.topicId}` },
      // ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetNoteQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useReorderNotesInTopicMutation,
  useMoveNotesMutation,
  useGetTopicNotesWithRelationsQuery,
  useGetAllNotesForRelationsQuery,
} = notesApi;
