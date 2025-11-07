import type { Note } from '@shared/types';
import { chatalogApi as baseApi } from '../api/chatalogApi';

type CreateNoteRequest = Partial<Pick<Note, 'subjectId' | 'topicId' | 'title' | 'markdown' | 'summary' | 'tags'>>;
type UpdateNoteRequest = { noteId: string; patch: Partial<Pick<Note, 'title' | 'markdown' | 'summary' | 'tags' | 'links'>> };
type DeleteNoteRequest = { noteId: string };

export const notesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Right panel — fetch detail by ID
    getNote: build.query<Note, string>({
      query: (noteId) => ({ url: `notes/${noteId}` }),
      providesTags: (_res, _err, noteId) => [{ type: 'Note', id: noteId }],
    }),

    // Create new note (optional UI button can call this)
    createNote: build.mutation<Note, CreateNoteRequest>({
      query: (body) => ({ url: 'notes', method: 'POST', body }),
      invalidatesTags: [{ type: 'Note', id: 'LIST' }],
    }),

    // Update note (autosave)
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

    // Delete note (optional)
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
} = notesApi;
