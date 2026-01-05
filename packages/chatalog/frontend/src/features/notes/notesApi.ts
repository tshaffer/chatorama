// frontend/src/features/notes/notesApi.ts
import type {
  Note,
  NotePreview,
  ReorderNotesRequest,
  MoveNotesPayload,
  MoveNotesResult,
  TopicNotesWithRelations,
  MergeNotesRequest,
  MergeNotesResult,
  Asset,
  NoteAssetWithAsset,
  CookedEvent,
  RecipeMeta,
} from '@chatorama/chatalog-shared';
import { chatalogApi as baseApi } from '../api/chatalogApi';
import { subjectsApi } from '../subjects/subjectsApi';

type CreateNoteRequest = Partial<
  Pick<
    Note,
    'subjectId' | 'topicId' | 'title' | 'markdown' | 'summary' | 'status' | 'tags' | 'relations'
  >
>;

type UpdateNoteRequest = {
  noteId: string;
  patch: Partial<
    Pick<
      Note,
      'title' | 'markdown' | 'summary' | 'status' | 'tags' | 'links' | 'relations' | 'subjectId' | 'topicId'
    >
  > & {
    recipe?: Partial<RecipeMeta>;
  };
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
        // Global "all notes" list tag (used by imports, createNote, etc.)
        const globalListTag = {
          type: 'Note' as const,
          id: 'LIST',
        };

        // Per-topic list tag
        const topicListTag = {
          type: 'Note' as const,
          id: `LIST:${subjectId}:${topicId}`,
        };

        if (!res) {
          // No data yet; still provide list tags so invalidations work
          return [globalListTag, topicListTag];
        }

        // Collect all notes that appear in this payload
        const allNotes = [
          ...(res.notes ?? []),
          ...(res.relatedTopicNotes ?? []),
          ...(res.relatedSubjectNotes ?? []),
          ...(res.relatedDirectNotes ?? []),
        ];

        const seen = new Set<string>();
        const noteTags = allNotes
          .filter((n) => n.id && !seen.has(n.id))
          .map((n) => {
            seen.add(n.id);
            return { type: 'Note' as const, id: n.id };
          });

        return [globalListTag, topicListTag, ...noteTags];
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

    uploadImage: build.mutation<{ asset: Asset }, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);
        return { url: 'assets/images', method: 'POST', body };
      },
    }),

    attachAssetToNote: build.mutation<
      NoteAssetWithAsset,
      { noteId: string; assetId: string; caption?: string }
    >({
      query: ({ noteId, ...body }) => ({
        url: `notes/${noteId}/assets`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { noteId }) => [{ type: 'Note' as const, id: noteId }],
    }),

    normalizeRecipeIngredients: build.mutation<Note, { noteId: string }>({
      query: ({ noteId }) => ({
        url: `recipes/${noteId}/normalize`,
        method: 'POST',
      }),
      invalidatesTags: (_res, _err, { noteId }) => [{ type: 'Note' as const, id: noteId }],
    }),

    addCookedEvent: build.mutation<Note, { noteId: string } & Partial<CookedEvent>>({
      query: ({ noteId, ...body }) => ({
        url: `recipes/${noteId}/cooked`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { noteId }) => [{ type: 'Note' as const, id: noteId }],
    }),

    searchRecipes: build.query<Note[], { query: string; mode?: 'any' | 'all' }>({
      query: ({ query, mode = 'any' }) => ({
        url: `recipes/search`,
        params: { query, mode },
      }),
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

    moveNotes: build.mutation<
      MoveNotesResult,
      MoveNotesPayload & { source?: { subjectId: string; topicId: string } }
    >({
      query: ({ noteIds, dest }) => ({
        url: 'notes:move',
        method: 'POST',
        // ⬇️ only send what the backend expects
        body: { noteIds, dest },
      }),
      // Invalidate:
      // - each moved note
      // - dest topic's list
      // - source topic's list (if provided)
      invalidatesTags: (_res, _err, { noteIds, dest, source }) => {
        const tags: { type: 'Note'; id: string }[] = [
          // per-note tags
          ...noteIds.map((id) => ({ type: 'Note' as const, id })),
          // destination topic list
          {
            type: 'Note' as const,
            id: `LIST:${dest.subjectId}:${dest.topicId}`,
          },
        ];

        if (source?.subjectId && source?.topicId) {
          tags.push({
            type: 'Note' as const,
            id: `LIST:${source.subjectId}:${source.topicId}`,
          });
        }

        return tags;
      },
    }),

    mergeNotesInTopic: build.mutation<
      MergeNotesResult,
      MergeNotesRequest & { subjectId?: string }
    >({
      query: ({ topicId, primaryNoteId, noteIdsInOrder, title }) => ({
        url: `topics/${topicId}/merge-notes`,
        method: 'POST',
        body: { primaryNoteId, noteIdsInOrder, title },
      }),
      invalidatesTags: (_res, _err, { subjectId, topicId, primaryNoteId, noteIdsInOrder }) => {
        const tags: { type: 'Note'; id: string }[] = [{ type: 'Note', id: 'LIST' }];
        if (subjectId) {
          tags.push({ type: 'Note', id: `LIST:${subjectId}:${topicId}` });
        }
        const ids = Array.from(
          new Set([...(noteIdsInOrder ?? []), primaryNoteId].filter(Boolean) as string[]),
        );
        tags.push(...ids.map((id) => ({ type: 'Note' as const, id }))); // merged + deleted
        return tags;
      },
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetNoteQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useUploadImageMutation,
  useAttachAssetToNoteMutation,
  useNormalizeRecipeIngredientsMutation,
  useAddCookedEventMutation,
  useSearchRecipesQuery,
  useReorderNotesInTopicMutation,
  useMoveNotesMutation,
  useGetTopicNotesWithRelationsQuery,
  useGetAllNotesForRelationsQuery,
  useMergeNotesInTopicMutation,
} = notesApi;
