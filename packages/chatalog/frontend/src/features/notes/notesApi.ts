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
  ApplyNoteChangesRequest,
  AppendAskConversationTurnRequest,
  AskAllSaveRequest,
  AskConversation,
  AskConversationSummary,
  AskConversationWithNotes,
  CreateAskConversationRequest,
  UpdateAskConversationRequest,
  ApplyNoteChangesResult,
  AskNotesSaveRequest,
  AskNotesSaveResult,
  ConsolidateSaveRequest,
  NoteChangePlanRequest,
  NoteChangePlanResponse,
  NoteChangeSetSummary,
  UndoNoteChangesResult,
  ConsolidateSaveResult,
  SetNotesArchivedRequest,
  SetNotesArchivedResult,
  Asset,
  NoteAssetWithAsset,
  CookedEvent,
  RecipeMeta,
} from '@chatorama/chatalog-shared';
import { chatalogApi as baseApi } from '../api/chatalogApi';
import { subjectsApi } from '../subjects/subjectsApi';

type UpdateNoteRequest = {
  noteId: string;
  patch: Partial<
    Pick<
      Note,
      'title'
      | 'markdown'
      | 'pdfSummaryMarkdown'
      | 'summary'
      | 'status'
      | 'tags'
      | 'links'
      | 'relations'
      | 'subjectId'
      | 'topicId'
    >
  > & {
    recipe?: Partial<RecipeMeta>;
  };
};

type DeleteNoteRequest = { noteId: string };

// Saved Ask Claude conversations: per topic, or across all notes
const ALL = 'ALL';
const conversationsUrl = (topicId?: string | null) =>
  topicId ? `topics/${topicId}/ask-conversations` : 'ask/conversations';

export const notesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNote: build.query<Note, string>({
      query: (noteId) => ({ url: `notes/${noteId}` }),
      providesTags: (_res, _err, noteId) => [{ type: 'Note', id: noteId }],
    }),

    getNoteAssets: build.query<NoteAssetWithAsset[], string>({
      query: (noteId) => ({ url: `notes/${noteId}/assets` }),
      providesTags: (_res, _err, noteId) => [{ type: 'NoteAsset' as const, id: `LIST:${noteId}` }],
    }),

    getGoogleOAuthStatus: build.query<{ connected: boolean; hasRefreshToken?: boolean }, void>({
      query: () => ({ url: 'google/oauth/status' }),
    }),

    getGoogleDocDriveStatus: build.query<
      {
        driveFileId: string;
        driveName?: string;
        driveModifiedTimeCurrent?: string;
        driveModifiedTimeAtImport?: string;
        importedAt?: string;
        isStale: boolean;
      },
      string
    >({
      query: (noteId) => ({ url: `googleDocNotes/${noteId}/driveStatus` }),
      providesTags: (_res, _err, noteId) => [{ type: 'GoogleDocStatus' as const, id: noteId }],
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
          ...(res.archivedNotes ?? []),
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
      {
        noteId: string;
        assetId: string;
        caption?: string;
        role?: 'viewer' | 'source' | 'other';
        sourceType?: string;
        mimeType?: string;
        filename?: string;
        storageKey?: string;
        sizeBytes?: number;
      }
    >({
      query: ({ noteId, ...body }) => ({
        url: `notes/${noteId}/assets`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { noteId }) => [
        { type: 'Note' as const, id: noteId },
        { type: 'NoteAsset' as const, id: `LIST:${noteId}` },
      ],
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

    saveConsolidatedNote: build.mutation<
      ConsolidateSaveResult,
      ConsolidateSaveRequest & { topicId: string; subjectId?: string }
    >({
      query: ({ topicId, subjectId: _subjectId, ...body }) => ({
        url: `topics/${topicId}/consolidate/save`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { subjectId, topicId, noteIds }) => {
        const tags: { type: 'Note' | 'TopicNotes'; id: string }[] = [{ type: 'Note', id: 'LIST' }];
        if (subjectId) {
          tags.push({ type: 'Note', id: `LIST:${subjectId}:${topicId}` });
          tags.push({ type: 'TopicNotes', id: `${subjectId}:${topicId}` });
        }
        tags.push(...noteIds.map((id) => ({ type: 'Note' as const, id })));
        return tags;
      },
    }),

    saveAskNotesAnswer: build.mutation<
      AskNotesSaveResult,
      AskNotesSaveRequest & { topicId: string; subjectId?: string }
    >({
      query: ({ topicId, subjectId: _subjectId, ...body }) => ({
        url: `topics/${topicId}/ask-notes/save`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { subjectId, topicId }) => {
        const tags: { type: 'Note' | 'TopicNotes'; id: string }[] = [{ type: 'Note', id: 'LIST' }];
        if (subjectId) {
          tags.push({ type: 'Note', id: `LIST:${subjectId}:${topicId}` });
          tags.push({ type: 'TopicNotes', id: `${subjectId}:${topicId}` });
        }
        return tags;
      },
    }),

    saveAskAllAnswer: build.mutation<AskNotesSaveResult, AskAllSaveRequest & { subjectId?: string }>({
      query: ({ subjectId: _subjectId, ...body }) => ({ url: 'ask/save', method: 'POST', body }),
      invalidatesTags: (_res, _err, { subjectId, topicId }) => {
        const tags: { type: 'Note' | 'TopicNotes'; id: string }[] = [{ type: 'Note', id: 'LIST' }];
        if (subjectId) {
          tags.push({ type: 'Note', id: `LIST:${subjectId}:${topicId}` });
          tags.push({ type: 'TopicNotes', id: `${subjectId}:${topicId}` });
        }
        return tags;
      },
    }),

    // No topicId: Ask across all notes, where changes can span topics
    proposeNoteChanges: build.mutation<NoteChangePlanResponse, NoteChangePlanRequest & { topicId?: string }>({
      query: ({ topicId, ...body }) => ({
        url: topicId ? `topics/${topicId}/ask-notes/plan` : 'ask/plan',
        method: 'POST',
        body,
      }),
    }),

    applyNoteChanges: build.mutation<
      ApplyNoteChangesResult,
      ApplyNoteChangesRequest & { topicId?: string; subjectId?: string }
    >({
      query: ({ topicId, subjectId: _subjectId, ...body }) => ({
        url: topicId ? `topics/${topicId}/note-changes/apply` : 'ask/note-changes/apply',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { subjectId, topicId, noteIds }) => {
        // Changes across topics can touch any topic's lists.
        if (!topicId) return ['TopicNotes', 'NoteChangeSet', { type: 'Note', id: 'LIST' }, ...noteIds.map((id) => ({ type: 'Note' as const, id }))];
        const tags: { type: 'Note' | 'TopicNotes' | 'NoteChangeSet'; id: string }[] = [
          { type: 'Note', id: 'LIST' },
          { type: 'NoteChangeSet', id: topicId },
          ...noteIds.map((id) => ({ type: 'Note' as const, id })),
        ];
        if (subjectId) {
          tags.push({ type: 'Note', id: `LIST:${subjectId}:${topicId}` });
          tags.push({ type: 'TopicNotes', id: `${subjectId}:${topicId}` });
        }
        return tags;
      },
    }),

    getNoteChangeSets: build.query<NoteChangeSetSummary[], string>({
      query: (topicId) => ({ url: `topics/${topicId}/note-changes` }),
      providesTags: (_res, _err, topicId) => [{ type: 'NoteChangeSet' as const, id: topicId }],
    }),

    undoNoteChanges: build.mutation<
      UndoNoteChangesResult,
      { topicId?: string; subjectId?: string; changeSetId: string }
    >({
      query: ({ topicId, changeSetId }) => ({
        url: topicId ? `topics/${topicId}/note-changes/${changeSetId}/undo` : `ask/note-changes/${changeSetId}/undo`,
        method: 'POST',
      }),
      invalidatesTags: (res, _err, { subjectId, topicId }) => {
        const noteTags = [...(res?.restoredNoteIds ?? []), ...(res?.archivedNoteIds ?? [])].map((id) => ({
          type: 'Note' as const,
          id,
        }));
        if (!topicId) return ['TopicNotes', 'NoteChangeSet', { type: 'Note', id: 'LIST' }, ...noteTags];
        const tags: { type: 'Note' | 'TopicNotes' | 'NoteChangeSet'; id: string }[] = [
          { type: 'Note', id: 'LIST' },
          { type: 'NoteChangeSet', id: topicId },
          ...[...(res?.restoredNoteIds ?? []), ...(res?.archivedNoteIds ?? [])].map((id) => ({
            type: 'Note' as const,
            id,
          })),
        ];
        if (subjectId) {
          tags.push({ type: 'Note', id: `LIST:${subjectId}:${topicId}` });
          tags.push({ type: 'TopicNotes', id: `${subjectId}:${topicId}` });
        }
        return tags;
      },
    }),

    // topicId null/absent: conversations across all notes
    getAskConversations: build.query<AskConversationSummary[], string | null>({
      query: (topicId) => ({ url: conversationsUrl(topicId) }),
      providesTags: (_res, _err, topicId) => [{ type: 'AskConversation' as const, id: topicId ?? ALL }],
    }),

    // Fetched fresh each time a conversation is continued (see AskNotesDialog), so not cached by tag
    getAskConversation: build.query<AskConversationWithNotes, { topicId?: string; conversationId: string }>({
      query: ({ topicId, conversationId }) => ({ url: `${conversationsUrl(topicId)}/${conversationId}` }),
    }),

    createAskConversation: build.mutation<AskConversation, CreateAskConversationRequest & { topicId?: string }>({
      query: ({ topicId, ...body }) => ({ url: conversationsUrl(topicId), method: 'POST', body }),
      invalidatesTags: (_res, _err, { topicId }) => [{ type: 'AskConversation' as const, id: topicId ?? ALL }],
    }),

    appendAskConversationTurn: build.mutation<
      { turnCount: number },
      AppendAskConversationTurnRequest & { topicId?: string; conversationId: string }
    >({
      query: ({ topicId, conversationId, ...body }) => ({
        url: `${conversationsUrl(topicId)}/${conversationId}/turns`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { topicId }) => [{ type: 'AskConversation' as const, id: topicId ?? ALL }],
    }),

    updateAskConversation: build.mutation<
      AskConversation,
      UpdateAskConversationRequest & { topicId?: string; conversationId: string }
    >({
      query: ({ topicId, conversationId, ...body }) => ({
        url: `${conversationsUrl(topicId)}/${conversationId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_res, _err, { topicId }) => [{ type: 'AskConversation' as const, id: topicId ?? ALL }],
    }),

    deleteAskConversation: build.mutation<void, { topicId?: string; conversationId: string }>({
      query: ({ topicId, conversationId }) => ({
        url: `${conversationsUrl(topicId)}/${conversationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { topicId }) => [{ type: 'AskConversation' as const, id: topicId ?? ALL }],
    }),

    setNotesArchived: build.mutation<SetNotesArchivedResult, SetNotesArchivedRequest>({
      query: (body) => ({ url: 'notes/archive', method: 'POST', body }),
      // Topic lists and Sources lists provide per-note tags, so these refresh them.
      invalidatesTags: (_res, _err, { noteIds }) => [
        { type: 'Note', id: 'LIST' },
        ...noteIds.map((id) => ({ type: 'Note' as const, id })),
      ],
    }),

    getConsolidationSources: build.query<NotePreview[], string>({
      query: (noteId) => ({ url: `notes/${noteId}/consolidation-sources` }),
      providesTags: (res, _err, noteId) => [
        { type: 'Note' as const, id: `SOURCES:${noteId}` },
        ...(res ?? []).map((n) => ({ type: 'Note' as const, id: n.id })),
      ],
    }),

    importGoogleDocFromDrive: build.mutation<
      { noteId: string; importedAt: string; driveModifiedTimeAtImport: string; stale: boolean },
      { driveFileId: string; noteId?: string; subjectId: string; topicId: string }
    >({
      query: (body) => ({
        url: 'googleDocNotes/importFromDrive',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_res, _err, { noteId, subjectId, topicId }) => {
        const tags: Array<{ type: 'Note' | 'GoogleDocStatus'; id: string }> = [
          { type: 'Note', id: 'LIST' },
          { type: 'Note', id: `LIST:${subjectId}:${topicId}` },
        ];
        if (noteId) tags.push({ type: 'Note' as const, id: noteId });
        if (noteId) tags.push({ type: 'GoogleDocStatus', id: noteId });
        return tags;
      },
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetNoteQuery,
  useGetNoteAssetsQuery,
  useGetGoogleOAuthStatusQuery,
  useGetGoogleDocDriveStatusQuery,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useUploadImageMutation,
  useAttachAssetToNoteMutation,
  useAddCookedEventMutation,
  useSearchRecipesQuery,
  useReorderNotesInTopicMutation,
  useMoveNotesMutation,
  useGetTopicNotesWithRelationsQuery,
  useGetAllNotesForRelationsQuery,
  useMergeNotesInTopicMutation,
  useSaveConsolidatedNoteMutation,
  useSaveAskNotesAnswerMutation,
  useProposeNoteChangesMutation,
  useApplyNoteChangesMutation,
  useGetNoteChangeSetsQuery,
  useUndoNoteChangesMutation,
  useGetAskConversationsQuery,
  useSaveAskAllAnswerMutation,
  useLazyGetAskConversationQuery,
  useCreateAskConversationMutation,
  useAppendAskConversationTurnMutation,
  useUpdateAskConversationMutation,
  useDeleteAskConversationMutation,
  useSetNotesArchivedMutation,
  useGetConsolidationSourcesQuery,
  useImportGoogleDocFromDriveMutation,
} = notesApi;
