// frontend/src/features/subjects/subjectsApi.ts
import type { Subject, Topic, NotePreview } from '@shared/types';
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
      providesTags: (res) =>
        res
          ? [{ type: 'Topic' as const, id: 'LIST' }, ...res.map(t => ({ type: 'Topic' as const, id: safeId(t as any) }))]
          : [{ type: 'Topic' as const, id: 'LIST' }],
    }),

    getNotePreviewsForTopic: build.query<NotePreview[], { subjectId: string; topicId: string }>({
      query: ({ subjectId, topicId }) => ({ url: `subjects/${subjectId}/topics/${topicId}/notes` }),
      providesTags: (res) =>
        res
          ? [{ type: 'Note' as const, id: 'LIST' }, ...res.map(n => ({ type: 'Note' as const, id: safeId(n as any) }))]
          : [{ type: 'Note' as const, id: 'LIST' }],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetSubjectsQuery,
  useGetTopicsForSubjectQuery,
  useGetNotePreviewsForTopicQuery,
} = subjectsApi;
