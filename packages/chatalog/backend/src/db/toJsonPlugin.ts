// backend/src/db/toJsonPlugin.ts
import type { Schema } from 'mongoose';

export function applyToJSON<T = any>(schema: Schema<T>) {
  // Preserve any schema-level toJSON that already exists
  const prev = schema.get('toJSON') || {};

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    ...prev, // allow per-schema overrides to remain
    transform: (doc: any, ret: any, options: any) => {
      // Run the previous transform first (if it exists)
      if (typeof (prev as any).transform === 'function') {
        (prev as any).transform(doc, ret, options);
      }
      if (ret && ret._id != null) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      if (ret && ret.__v != null) {
        delete ret.__v;
      }
      return ret;
    },
  });

  // Optional: mirror the same behavior for toObject()
  const prevObj = schema.get('toObject') || {};
  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
    ...prevObj,
    transform: (doc: any, ret: any, options: any) => {
      if (typeof (prevObj as any).transform === 'function') {
        (prevObj as any).transform(doc, ret, options);
      }
      if (ret && ret._id != null) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      if (ret && ret.__v != null) {
        delete ret.__v;
      }
      return ret;
    },
  });
}
