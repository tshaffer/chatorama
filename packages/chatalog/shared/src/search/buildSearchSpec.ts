import type { SearchMode, SearchScope, SearchSpec } from '../types/searchTypes';

export type BuildSearchSpecInput = {
  query?: string;
  text?: string;
  mode?: string;
  scope?: string;
  limit?: number | string;
  subjectId?: unknown;
  topicId?: unknown;
  status?: unknown;
  tags?: unknown;
  updatedFrom?: unknown;
  updatedTo?: unknown;
  minSemanticScore?: unknown;
  prepTimeMax?: unknown;
  cookTimeMax?: unknown;
  totalTimeMax?: unknown;
  cuisine?: unknown;
  category?: unknown;
  keywords?: unknown;
  includeIngredients?: unknown;
  excludeIngredients?: unknown;
  [k: string]: unknown;
};

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  const s = normalizeString(value);
  if (!s) return [];
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function buildSearchSpec(input: BuildSearchSpecInput): SearchSpec {
  const rawQuery = normalizeString(input.query ?? input.text);
  const modeRaw = normalizeString(input.mode).toLowerCase();
  const scopeRaw = normalizeString(input.scope).toLowerCase();

  const mode: SearchMode =
    modeRaw === 'auto' || modeRaw === 'hybrid' || modeRaw === 'semantic' || modeRaw === 'keyword'
      ? (modeRaw as SearchMode)
      : 'auto';

  const scope: SearchScope =
    scopeRaw === 'recipes' || scopeRaw === 'notes' || scopeRaw === 'all'
      ? (scopeRaw as SearchScope)
      : 'all';

  const limitNum = normalizeNumber(input.limit);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(50, Math.floor(limitNum!))) : 20;

  return {
    query: rawQuery,
    mode,
    scope,
    limit,
    filters: {
      subjectId: normalizeString(input.subjectId) || undefined,
      topicId: normalizeString(input.topicId) || undefined,
      status: normalizeString(input.status) || undefined,
      tags: normalizeStringArray(input.tags),
      updatedFrom: normalizeString(input.updatedFrom) || undefined,
      updatedTo: normalizeString(input.updatedTo) || undefined,
      minSemanticScore: normalizeNumber(input.minSemanticScore),
      prepTimeMax: normalizeNumber(input.prepTimeMax),
      cookTimeMax: normalizeNumber(input.cookTimeMax),
      totalTimeMax: normalizeNumber(input.totalTimeMax),
      cuisine: normalizeStringArray(input.cuisine),
      category: normalizeStringArray(input.category),
      keywords: normalizeStringArray(input.keywords),
      includeIngredients: normalizeStringArray(input.includeIngredients),
      excludeIngredients: normalizeStringArray(input.excludeIngredients),
    },
  };
}
