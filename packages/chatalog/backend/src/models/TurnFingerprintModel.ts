import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface TurnFingerprintDoc extends Document {
  _id: Types.ObjectId;
  sourceType: string; // e.g., 'chatworthy'
  pairHash: string;
  noteId: Types.ObjectId; // owning Note; used for cleanup when a note is deleted
  chatId?: string;
  turnIndex?: number;
  createdAt: Date;
}

const TurnFingerprintSchema = new Schema<TurnFingerprintDoc>(
  {
    sourceType: { type: String, required: true },
    pairHash: { type: String, required: true },
    noteId: { type: Schema.Types.ObjectId, ref: 'Note', required: true },
    chatId: { type: String },
    turnIndex: { type: Number },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

TurnFingerprintSchema.index({ sourceType: 1, pairHash: 1 });

applyToJSON(TurnFingerprintSchema);

export const TurnFingerprintModel = mongoose.model<TurnFingerprintDoc>(
  'TurnFingerprint',
  TurnFingerprintSchema,
);

export default TurnFingerprintModel;
