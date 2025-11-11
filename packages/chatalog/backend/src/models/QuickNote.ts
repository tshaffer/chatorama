import { Schema, model, Document } from 'mongoose';

export interface QuickNoteDoc extends Document {
  title: string;
  markdown: string;
  subjectId?: string; // store as string to match NoteModel
  topicId?: string;   // store as string to match NoteModel
  createdAt: Date;
  updatedAt: Date;
}

const QuickNoteSchema = new Schema<QuickNoteDoc>(
  {
    title: { type: String, required: true, trim: true, default: 'Untitled quick note' },
    markdown: { type: String, required: true, default: '' },
    subjectId: { type: String },
    topicId: { type: String },
  },
  { timestamps: true }
);

QuickNoteSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret: any) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

QuickNoteSchema.index({ title: 'text', markdown: 'text' });

export const QuickNoteModel = model<QuickNoteDoc>('QuickNote', QuickNoteSchema);
