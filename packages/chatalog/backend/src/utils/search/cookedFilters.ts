type CookedFilter = 'any' | 'ever' | 'never';

export type CookedHistoryFilterInput = {
  cooked?: CookedFilter;
  cookedWithinDays?: number;
  minAvgCookedRating?: number;
  now?: Date;
};

export function buildCookedHistoryFilter(input: CookedHistoryFilterInput): Record<string, any> {
  const cooked =
    input.cooked === 'any' || input.cooked == null ? undefined : input.cooked;
  const cookedWithinDays =
    Number.isFinite(input.cookedWithinDays) && (input.cookedWithinDays ?? 0) > 0
      ? Number(input.cookedWithinDays)
      : undefined;
  const minAvgCookedRating = Number.isFinite(input.minAvgCookedRating)
    ? Number(input.minAvgCookedRating)
    : undefined;

  const clauses: Record<string, any>[] = [];

  if (cooked === 'ever') {
    clauses.push({
      $or: [
        { 'recipe.search.cookedCount': { $gt: 0 } },
        { 'cookedHistory.0': { $exists: true } },
      ],
    });
  } else if (cooked === 'never') {
    clauses.push({
      $or: [
        { 'recipe.search.cookedCount': { $eq: 0 } },
        { 'recipe.search.cookedCount': { $exists: false } },
        { 'cookedHistory.0': { $exists: false } },
      ],
    });
  }

  if (cookedWithinDays != null) {
    const now = input.now ?? new Date();
    const cutoffMs = now.getTime() - cookedWithinDays * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    clauses.push({
      $or: [
        { 'recipe.search.lastCookedAt': { $gte: cutoffIso } },
        { cookedHistory: { $elemMatch: { cookedAt: { $gte: cutoffIso } } } },
      ],
    });
  }

  if (minAvgCookedRating != null) {
    clauses.push({
      $or: [
        { 'recipe.search.avgCookedRating': { $gte: minAvgCookedRating } },
        { cookedHistory: { $elemMatch: { rating: { $gte: minAvgCookedRating } } } },
      ],
    });
  }

  if (!clauses.length) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}
