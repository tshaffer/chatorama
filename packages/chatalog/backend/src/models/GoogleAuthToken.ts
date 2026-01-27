import mongoose, { Schema, Document } from 'mongoose';
import { applyToJSON } from '../db/toJsonPlugin';

export interface GoogleAuthTokenDoc extends Document {
  provider: 'google';
  accessTokenEnc?: string;
  refreshTokenEnc?: string;
  expiryDate?: Date;
  scopes?: string;
  oauthState?: string;
  oauthStateExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GoogleAuthTokenSchema = new Schema<GoogleAuthTokenDoc>(
  {
    provider: { type: String, enum: ['google'], required: true, unique: true },
    accessTokenEnc: { type: String },
    refreshTokenEnc: { type: String },
    expiryDate: { type: Date },
    scopes: { type: String },
    oauthState: { type: String },
    oauthStateExpiresAt: { type: Date },
  },
  { timestamps: true }
);

applyToJSON(GoogleAuthTokenSchema);

export const GoogleAuthTokenModel = mongoose.model<GoogleAuthTokenDoc>(
  'GoogleAuthToken',
  GoogleAuthTokenSchema
);
