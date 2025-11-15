// frontend/src/features/imports/importsApi.ts
import { chatalogApi as baseApi } from '../api/chatalogApi';

export type ImportedNoteSummary = {
  file: string;
  noteId: string;
  title: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicName?: string;
  body: string;
};

export type ImportResponse = {
  imported: number;
  results: ImportedNoteSummary[];
};

export const importsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
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
      // A successful import can add new subjects/topics/notes; refresh the lists.
      invalidatesTags: [
        { type: 'Subject' as const, id: 'LIST' },
        { type: 'Topic' as const, id: 'LIST' },
        { type: 'Note' as const, id: 'LIST' },
      ],
    }),
  }),
  overrideExisting: true,
});

export const { useImportChatworthyMutation } = importsApi;
