import type { CookedEvent } from '@chatorama/chatalog-shared';

export type CookedSearchFields = {
  lastCookedAt?: string;
  cookedCount: number;
  avgCookedRating?: number;
  cookedNotesText?: string;
};

export function computeCookedSearchFields(cookedHistory: CookedEvent[]): CookedSearchFields {
  const events = Array.isArray(cookedHistory) ? cookedHistory : [];
  const cookedCount = events.length;

  let lastCookedAt: string | undefined;
  let lastMs = Number.NEGATIVE_INFINITY;
  for (const evt of events) {
    const ms = Date.parse(String(evt?.cookedAt ?? ''));
    if (Number.isNaN(ms)) continue;
    if (ms > lastMs) {
      lastMs = ms;
      lastCookedAt = new Date(ms).toISOString();
    }
  }

  const ratings = events
    .map((evt) => evt?.rating)
    .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));
  const avgCookedRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum, val) => sum + val, 0) / ratings.length) * 10) / 10
      : undefined;

  const cookedNotesText = events
    .map((evt) => String(evt?.notes ?? '').trim())
    .filter(Boolean)
    .join('\n');

  return {
    lastCookedAt,
    cookedCount,
    avgCookedRating,
    cookedNotesText: cookedNotesText.length ? cookedNotesText : undefined,
  };
}
