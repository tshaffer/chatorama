import type { SearchSpec } from '@chatorama/chatalog-shared';

function isNonEmptyFilter(filter: Record<string, any> | undefined | null): boolean {
  return !!filter && Object.keys(filter).length > 0;
}

export function splitAndDedupTokens(raw: unknown): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  const parts = s
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(' ');
}

function expandVariants(vals: string[]): string[] {
  const out = new Set<string>();
  for (const v of vals) {
    const base = v.trim();
    if (!base) continue;
    out.add(base);
    out.add(base.toLowerCase());
    out.add(titleCase(base));
  }
  return Array.from(out);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ingredientRegex(token: string): RegExp {
  const e = escapeRegex(token);
  return new RegExp(e, 'i');
}

export function buildIngredientFilterForSource(
  source: 'tokens' | 'normalized' | 'raw',
  includeTokens: string[],
  excludeTokens: string[],
) {
  if (source === 'tokens') {
    const field = 'recipe.ingredientTokens';
    const filter: Record<string, any> = {};
    if (includeTokens.length) filter.$all = includeTokens;
    if (excludeTokens.length) filter.$nin = excludeTokens;
    if (!Object.keys(filter).length) return {};
    return { [field]: filter };
  }

  const clauses: Record<string, any>[] = [];

  const includeClauses = includeTokens.map((t) => {
    const re = ingredientRegex(t);
    if (source === 'raw') {
      return { 'recipe.ingredientsRaw': { $elemMatch: { $regex: re } } };
    }
    return {
      'recipe.ingredients': {
        $elemMatch: {
          name: { $regex: re },
          deleted: { $ne: true },
        },
      },
    };
  });
  if (includeClauses.length) clauses.push(...includeClauses);

  const excludeClauses = excludeTokens.map((t) => {
    const re = ingredientRegex(t);
    if (source === 'raw') {
      return {
        'recipe.ingredientsRaw': { $not: { $elemMatch: { $regex: re } } },
      };
    }
    return {
      'recipe.ingredients': {
        $not: {
          $elemMatch: {
            name: { $regex: re },
            deleted: { $ne: true },
          },
        },
      },
    };
  });
  if (excludeClauses.length) clauses.push(...excludeClauses);

  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

function eqFilter(v: string) {
  return { $eq: v };
}

function inFilter(vals: string[]) {
  return { $in: vals };
}

function mergeFilters(atlasFilter: Record<string, any>, postFilter: Record<string, any>) {
  const hasAtlas = isNonEmptyFilter(atlasFilter);
  const hasPost = isNonEmptyFilter(postFilter);
  if (hasAtlas && hasPost) return { $and: [atlasFilter, postFilter] };
  if (hasAtlas) return atlasFilter;
  if (hasPost) return postFilter;
  return {};
}

function combineFilters(a: Record<string, any>, b: Record<string, any>) {
  const hasA = isNonEmptyFilter(a);
  const hasB = isNonEmptyFilter(b);
  if (hasA && hasB) return { $and: [a, b] };
  if (hasA) return a;
  if (hasB) return b;
  return {};
}

export function buildNoteFilterFromSpec(
  spec: SearchSpec,
  ingredientFilter?: Record<string, any>,
): {
  atlasFilter: Record<string, any>;
  postFilter: Record<string, any>;
  combinedFilter: Record<string, any>;
} {
  const atlasFilter: Record<string, any> = {};
  let postFilter: Record<string, any> = {};
  const allowRecipeFilters = spec.scope === 'recipes';

  if (spec.scope === 'recipes') {
    atlasFilter.docKind = 'recipe';
  } else if (spec.scope === 'notes') {
    atlasFilter.docKind = 'note';
  }

  if (spec.filters.subjectId) atlasFilter.subjectId = spec.filters.subjectId;
  if (spec.filters.topicId) atlasFilter.topicId = spec.filters.topicId;

  if (spec.filters.tags?.length) {
    atlasFilter.tags = { $in: spec.filters.tags };
  }

  if (allowRecipeFilters) {
    if (spec.filters.prepTimeMax != null) {
      atlasFilter['recipe.prepTimeMinutes'] = { $lte: spec.filters.prepTimeMax };
    }

    if (spec.filters.cookTimeMax != null) {
      atlasFilter['recipe.cookTimeMinutes'] = { $lte: spec.filters.cookTimeMax };
    }

    if (spec.filters.totalTimeMax != null) {
      atlasFilter['recipe.totalTimeMinutes'] = { $lte: spec.filters.totalTimeMax };
    }

    if (spec.filters.cuisine?.length) {
      const expanded = expandVariants(spec.filters.cuisine);
      if (expanded.length === 1) atlasFilter['recipe.cuisine'] = eqFilter(expanded[0]);
      else if (expanded.length > 1) atlasFilter['recipe.cuisine'] = inFilter(expanded);
    }

    if (spec.filters.category?.length) {
      const expanded = expandVariants(spec.filters.category);
      if (expanded.length) atlasFilter['recipe.category'] = inFilter(expanded);
    }

    if (spec.filters.keywords?.length) {
      const expanded = expandVariants(spec.filters.keywords);
      if (expanded.length) atlasFilter['recipe.keywords'] = inFilter(expanded);
    }

    if (ingredientFilter) {
      postFilter = combineFilters(postFilter, ingredientFilter);
    }
  }

  const combinedFilter = mergeFilters(atlasFilter, postFilter);
  return { atlasFilter, postFilter, combinedFilter };
}
