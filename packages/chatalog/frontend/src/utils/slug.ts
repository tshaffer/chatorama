// frontend/src/utils/slug.ts
export function getIdFromSlug(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  // we encode as "<id>-<slugified-name>"; take the leading id
  return slug.split('-')[0];
}
