// frontend/src/features/notes/notesApi.ts
import type { Note, ReorderNotesRequest } from '@chatorama/chatalog-shared';
import { chatalogApi as baseApi } from '../api/chatalogApi';
import { subjectsApi } from '../subjects/subjectsApi'; // ← import to reach that cache

type CreateNoteRequest = Partial<Pick<Note, 'subjectId' | 'topicId' | 'title' | 'markdown' | 'summary' | 'tags'>>;
type UpdateNoteRequest = { noteId: string; patch: Partial<Pick<Note, 'title' | 'markdown' | 'summary' | 'tags' | 'links'>> };
type DeleteNoteRequest = { noteId: string };

export const notesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNote: build.query<Note, string>({
      query: (noteId) => ({ url: `notes/${noteId}` }),
      providesTags: (_res, _err, noteId) => [{ type: 'Note', id: noteId }],
    }),

    createNote: build.mutation<Note, CreateNoteRequest>({
      query: (body) => ({ url: 'notes', method: 'POST', body }),
      // If you want to specifically invalidate the new topic list when subjectId/topicId are present:
      invalidatesTags: (res, _err, body) => {
        const tags = [{ type: 'Note' as const, id: 'LIST' }];
        if (body?.subjectId && body?.topicId) {
          tags.push({ type: 'Note' as const, id: `LIST:${body.subjectId}:${body.topicId}` });
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
    reorderNotesInTopic: build.mutation<{ ok: true }, { subjectId: string; topicId: string; noteIdsInOrder: string[] }>({
      query: ({ subjectId, topicId, noteIdsInOrder }) => ({
        url: `subjects/${subjectId}/topics/${topicId}/notes/reorder`,
        method: 'PATCH',
        body: { noteIdsInOrder } satisfies ReorderNotesRequest,
      }),
      async onQueryStarted({ subjectId, topicId, noteIdsInOrder }, { dispatch, queryFulfilled }) {
        // Optimistically reorder the NotePreview[] in subjectsApi.getNotePreviewsForTopic cache
        const patch = dispatch(
          subjectsApi.util.updateQueryData(
            'getNotePreviewsForTopic',
            { subjectId, topicId },
            (draft: any[]) => {
              const byId = new Map(draft.map((n) => [n.id ?? n._id, n]));
              const reordered = noteIdsInOrder.map((id) => byId.get(id)).filter(Boolean);
              if (reordered.length === draft.length) {
                reordered.forEach((n, idx) => { (n as any).order = idx; });
                // Replace array contents in-place (immer draft)
                draft.length = 0;
                draft.push(...reordered);
              }
            }
          )
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
  }),
  overrideExisting: true,
});

export const {
  useGetNoteQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useReorderNotesInTopicMutation
} = notesApi;
