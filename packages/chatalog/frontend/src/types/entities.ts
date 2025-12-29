export type QuickNote = {
  id: string;
  title: string;
  markdown: string;
  subjectId?: string;
  topicId?: string;
  createdAt: string;
  updatedAt: string;
};

export type QuickNoteAsset = {
  id: string;
  quickNoteId: string;
  assetId: string;
  order: number;
  caption?: string;
  asset?: {
    id: string;
    mimeType?: string;
    byteSize?: number;
    imageMeta?: { width?: number; height?: number };
    createdAt?: string;
    url: string;
  };
};
