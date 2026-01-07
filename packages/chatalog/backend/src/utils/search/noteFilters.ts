export function clampIntOpt(value: any, min: number, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function isNonEmptyFilter(filter: Record<string, any> | undefined | null): boolean {
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

export function parseCsvParam(raw: unknown): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(' ');
}

export function expandVariants(vals: string[]): string[] {
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

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ingredientRegex(token: string): RegExp {
  const e = escapeRegex(token);
  return new RegExp(e, 'i');
}

export function buildIngredientFilterForSource(
  source: 'normalized' | 'raw',
  includeTokens: string[],
  excludeTokens: string[],
) {
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

export function eqFilter(v: string) {
  return { $eq: v };
}

export function inFilter(vals: string[]) {
  return { $in: vals };
}

export function mergeFilters(atlasFilter: Record<string, any>, postFilter: Record<string, any>) {
  const hasAtlas = isNonEmptyFilter(atlasFilter);
  const hasPost = isNonEmptyFilter(postFilter);
  if (hasAtlas && hasPost) return { $and: [atlasFilter, postFilter] };
  if (hasAtlas) return atlasFilter;
  if (hasPost) return postFilter;
  return {};
}

export function combineFilters(a: Record<string, any>, b: Record<string, any>) {
  const hasA = isNonEmptyFilter(a);
  const hasB = isNonEmptyFilter(b);
  if (hasA && hasB) return { $and: [a, b] };
  if (hasA) return a;
  if (hasB) return b;
  return {};
}

export function buildNoteFilterFromQuery(
  query: any,
  ingredientFilter?: Record<string, any>,
): {
  atlasFilter: Record<string, any>;
  postFilter: Record<string, any>;
  combinedFilter: Record<string, any>;
} {
  const atlasFilter: Record<string, any> = {};
  let postFilter: Record<string, any> = {};

  const scope = String(query.scope ?? '').trim().toLowerCase();
  if (scope === 'recipes') {
    atlasFilter.recipe = { $exists: true };
  } else if (scope === 'notes') {
    atlasFilter.recipe = { $exists: false };
  }

  const subjectId = String(query.subjectId ?? '').trim();
  if (subjectId) atlasFilter.subjectId = subjectId;

  const topicId = String(query.topicId ?? '').trim();
  if (topicId) atlasFilter.topicId = topicId;

  // tags=tag1,tag2,tag3  => match ANY tag
  const tagsRaw = String(query.tags ?? '').trim();
  if (tagsRaw) {
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (tags.length) atlasFilter.tags = { $in: tags };
  }

  const maxPrepMinutes = clampIntOpt(query.maxPrepMinutes, 0, 72460);
  if (maxPrepMinutes != null) {
    atlasFilter['recipe.prepTimeMinutes'] = { $lte: maxPrepMinutes };
  }

  const maxCookMinutes = clampIntOpt(query.maxCookMinutes, 0, 72460);
  if (maxCookMinutes != null) {
    atlasFilter['recipe.cookTimeMinutes'] = { $lte: maxCookMinutes };
  }

  const maxTotalMinutes = clampIntOpt(query.maxTotalMinutes, 0, 72460);
  if (maxTotalMinutes != null) {
    atlasFilter['recipe.totalTimeMinutes'] = { $lte: maxTotalMinutes };
  }

  const cuisineVals = parseCsvParam(query.cuisine);
  if (cuisineVals.length) {
    const expanded = expandVariants(cuisineVals);
    if (expanded.length === 1) atlasFilter['recipe.cuisine'] = eqFilter(expanded[0]);
    else if (expanded.length > 1) atlasFilter['recipe.cuisine'] = inFilter(expanded);
  }

  const categoryVals = parseCsvParam(query.category);
  if (categoryVals.length) {
    const expanded = expandVariants(categoryVals);
    if (expanded.length) atlasFilter['recipe.category'] = inFilter(expanded);
  }

  const keywordVals = parseCsvParam(query.keywords ?? query.keyword);
  if (keywordVals.length) {
    const expanded = expandVariants(keywordVals);
    if (expanded.length) atlasFilter['recipe.keywords'] = inFilter(expanded);
  }

  if (ingredientFilter) {
    postFilter = combineFilters(postFilter, ingredientFilter);
  }

  const combinedFilter = mergeFilters(atlasFilter, postFilter);
  return { atlasFilter, postFilter, combinedFilter };
}
