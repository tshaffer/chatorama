// frontend/src/features/imports/importsApi.ts
import { chatalogApi as baseApi } from '../api/chatalogApi';

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
};

export type ImportResponse = {
  imported: number;
  results: ImportedNoteSummary[];
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

export const importsApi = baseApi.injectEndpoints({
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
      // Preview only, no invalidations.
    }),

    // APPLY import: actually create Subjects/Topics/Notes
    applyChatworthyImport: build.mutation<{ created: number; noteIds: string[] }, { rows: ApplyImportedRow[] }>({
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
  }),
  overrideExisting: true,
});

export const {
  useImportChatworthyMutation,
  useImportAiClassificationPreviewMutation,
  useApplyChatworthyImportMutation,
} = importsApi;
