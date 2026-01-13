// frontend/src/features/imports/importsApi.ts
import { chatalogApi as baseApi } from '../api/chatalogApi';
import type {
  ImportBatch,
  NotePreview,
  DuplicateStatus,
  TurnConflict,
  ApplyNoteImportCommand,
  ApplyImportResponse,
} from '@chatorama/chatalog-shared';

export type ImportedNoteSummary = {
  file: string;
  importKey: string;
  title: string;
  subjectName?: string;
  topicName?: string;
  body: string;
  tags?: string[];
  summary?: string;
  provenanceUrl?: string;
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;
  duplicateStatus: DuplicateStatus;
  duplicateCount: number;
  conflicts: TurnConflict[];
};

export type ImportResponse = {
  imported: number;
  results: ImportedNoteSummary[];
  combinedNote?: ImportedNoteSummary;
  hasDuplicateTurns: boolean;
  duplicateTurnCount: number;
};

export type ApplyImportedRow = {
  importKey: string;
  title: string;
  body: string;
  subjectLabel?: string;
  topicLabel?: string;
  tags?: string[];
  summary?: string;
  provenanceUrl?: string;
  chatworthyNoteId?: string;
  chatworthyChatId?: string;
  chatworthyChatTitle?: string;
  chatworthyFileName?: string;
  chatworthyTurnIndex?: number;
  chatworthyTotalTurns?: number;
};

export type ApplyImportRequestPayload = {
  rows: ApplyImportedRow[];
  notes: ApplyNoteImportCommand[];
};

const importsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // PREVIEW import (no DB writes) - Chatworthy markdown/zip
    importChatworthy: build.mutation<ImportResponse, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);
        return {
          url: 'imports/chatworthy',
          method: 'POST',
          body,
        };
      },
      transformResponse: (res: ImportResponse) => ({
        ...res,
        hasDuplicateTurns: res.hasDuplicateTurns ?? false,
        duplicateTurnCount: res.duplicateTurnCount ?? 0,
      }),
      // No invalidatesTags here; preview only.
    }),

    // NEW: PREVIEW import from AI classification (paths come from backend env vars)
    importAiClassificationPreview: build.mutation<
      ImportResponse,
      void
    >({
      query: () => ({
        url: 'imports/ai-classification/preview',
        method: 'POST',
      }),
      transformResponse: (res: ImportResponse) => ({
        ...res,
        hasDuplicateTurns: res.hasDuplicateTurns ?? false,
        duplicateTurnCount: res.duplicateTurnCount ?? 0,
      }),
      // Preview only, no invalidations.
    }),

    // APPLY import: actually create Subjects/Topics/Notes
    applyChatworthyImport: build.mutation<ApplyImportResponse, ApplyImportRequestPayload>({
      query: (payload) => ({
        url: 'imports/chatworthy/apply',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: [
        { type: 'Subject' as const, id: 'LIST' },
        { type: 'Topic' as const, id: 'LIST' },
        { type: 'Note' as const, id: 'LIST' },
      ],
    }),

    getImportBatches: build.query<ImportBatch[], void>({
      query: () => ({ url: 'import-batches' }),
      providesTags: (res) =>
        res
          ? [
            { type: 'ImportBatch' as const, id: 'LIST' },
            ...res.map((b) => ({ type: 'ImportBatch' as const, id: (b as any).id ?? (b as any)._id })),
          ]
          : [{ type: 'ImportBatch' as const, id: 'LIST' }],
    }),

    getImportBatchNotes: build.query<NotePreview[], string>({
      query: (batchId) => ({ url: `import-batches/${batchId}/notes` }),
      providesTags: (res, _err, batchId) =>
        res
          ? [
            { type: 'ImportBatch' as const, id: batchId },
            ...res.map((n) => ({ type: 'Note' as const, id: n.id })),
          ]
          : [{ type: 'ImportBatch' as const, id: batchId }],
    }),

    deleteImportBatch: build.mutation<void, { batchId: string }>({
      query: ({ batchId }) => ({
        url: `import-batches/${batchId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_res, _err, { batchId }) => [
        { type: 'ImportBatch' as const, id: 'LIST' },
        { type: 'ImportBatch' as const, id: batchId },
      ],
    }),

    deleteAllImportBatches: build.mutation<void, void>({
      query: () => ({
        url: 'import-batches',
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'ImportBatch' as const, id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useImportChatworthyMutation,
  useImportAiClassificationPreviewMutation,
  useApplyChatworthyImportMutation,
  useGetImportBatchesQuery,
  useGetImportBatchNotesQuery,
  useDeleteImportBatchMutation,
  useDeleteAllImportBatchesMutation,
} = importsApi;
