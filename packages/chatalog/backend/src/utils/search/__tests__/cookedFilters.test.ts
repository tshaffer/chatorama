import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCookedHistoryFilter } from '../cookedFilters';

test('buildCookedHistoryFilter returns empty filter when unset', () => {
  const result = buildCookedHistoryFilter({});
  assert.deepEqual(result, {});
});

test('buildCookedHistoryFilter handles cooked ever/never', () => {
  assert.deepEqual(buildCookedHistoryFilter({ cooked: 'ever' }), {
    $or: [
      { 'recipe.search.cookedCount': { $gt: 0 } },
      { 'cookedHistory.0': { $exists: true } },
    ],
  });

  assert.deepEqual(buildCookedHistoryFilter({ cooked: 'never' }), {
    $or: [
      { 'recipe.search.cookedCount': { $eq: 0 } },
      { 'recipe.search.cookedCount': { $exists: false } },
      { 'cookedHistory.0': { $exists: false } },
    ],
  });
});

test('buildCookedHistoryFilter handles cookedWithinDays with fixed now', () => {
  const now = new Date('2024-02-01T00:00:00.000Z');
  const result = buildCookedHistoryFilter({ cookedWithinDays: 30, now });
  assert.deepEqual(result, {
    $or: [
      { 'recipe.search.lastCookedAt': { $gte: '2024-01-02T00:00:00.000Z' } },
      { cookedHistory: { $elemMatch: { cookedAt: { $gte: '2024-01-02T00:00:00.000Z' } } } },
    ],
  });
});

test('buildCookedHistoryFilter handles minAvgCookedRating and combinations', () => {
  const now = new Date('2024-02-01T00:00:00.000Z');
  const result = buildCookedHistoryFilter({
    cooked: 'ever',
    cookedWithinDays: 7,
    minAvgCookedRating: 4.5,
    now,
  });
  assert.deepEqual(result, {
    $and: [
      {
        $or: [
          { 'recipe.search.cookedCount': { $gt: 0 } },
          { 'cookedHistory.0': { $exists: true } },
        ],
      },
      {
        $or: [
          { 'recipe.search.lastCookedAt': { $gte: '2024-01-25T00:00:00.000Z' } },
          { cookedHistory: { $elemMatch: { cookedAt: { $gte: '2024-01-25T00:00:00.000Z' } } } },
        ],
      },
      {
        $or: [
          { 'recipe.search.avgCookedRating': { $gte: 4.5 } },
          { cookedHistory: { $elemMatch: { rating: { $gte: 4.5 } } } },
        ],
      },
    ],
  });
});
