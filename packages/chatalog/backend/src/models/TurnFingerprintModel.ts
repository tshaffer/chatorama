import mongoose, { Schema, Document, Types } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export type PairHashVersion = 1 | 2;

export interface TurnFingerprintDoc extends Document {
  _id: Types.ObjectId;
  sourceType: string; // e.g., 'chatworthy'
  pairHash: string;
  hashVersion: PairHashVersion;
  noteId: Types.ObjectId; // owning Note; used for cleanup when a note is deleted
  chatId?: string;
  turnIndex?: number;
  createdAt: Date;
}

const TurnFingerprintSchema = new Schema<TurnFingerprintDoc>(
  {
    sourceType: { type: String, required: true },
    pairHash: { type: String, required: true },

    // ✅ New: hash version for pairHash canonicalization
    // Default 1 so existing docs are implicitly v1 without needing a migration first.
    hashVersion: { type: Number, enum: [1, 2], default: 1, required: true },

    noteId: { type: Schema.Types.ObjectId, ref: 'Note', required: true },
    chatId: { type: String },
    turnIndex: { type: Number },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Keep existing lookup index (still useful)
TurnFingerprintSchema.index({ sourceType: 1, pairHash: 1 });

// ✅ Strongly recommended: prevent accidental duplicate fingerprints per turn+version
// This supports the “add v2 alongside v1” strategy safely.
TurnFingerprintSchema.index(
  { sourceType: 1, noteId: 1, turnIndex: 1, hashVersion: 1 },
  { unique: true }
);

// Optional but often helpful if you query by chatId/turnIndex
TurnFingerprintSchema.index({ sourceType: 1, chatId: 1, turnIndex: 1, hashVersion: 1 });

applyToJSON(TurnFingerprintSchema);

export const TurnFingerprintModel = mongoose.model<TurnFingerprintDoc>(
  'TurnFingerprint',
  TurnFingerprintSchema
);

export default TurnFingerprintModel;
