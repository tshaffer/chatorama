import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCookedSearchFields } from '../computeCookedSearchFields';

test('computeCookedSearchFields returns defaults for empty history', () => {
  const result = computeCookedSearchFields([]);
  assert.equal(result.cookedCount, 0);
  assert.equal(result.lastCookedAt, undefined);
  assert.equal(result.avgCookedRating, undefined);
  assert.equal(result.cookedNotesText, undefined);
});

test('computeCookedSearchFields picks the latest cookedAt', () => {
  const result = computeCookedSearchFields([
    { id: 'a', cookedAt: '2024-01-03T12:00:00.000Z' },
    { id: 'b', cookedAt: 'invalid-date' },
    { id: 'c', cookedAt: '2024-02-01T09:15:00.000Z' },
  ]);
  assert.equal(result.lastCookedAt, '2024-02-01T09:15:00.000Z');
});

test('computeCookedSearchFields averages ratings and rounds to 1 decimal', () => {
  const result = computeCookedSearchFields([
    { id: 'a', cookedAt: '2024-01-01T00:00:00.000Z', rating: 4 },
    { id: 'b', cookedAt: '2024-01-02T00:00:00.000Z', rating: 5 },
    { id: 'c', cookedAt: '2024-01-03T00:00:00.000Z' },
  ]);
  assert.equal(result.avgCookedRating, 4.5);

  const rounded = computeCookedSearchFields([
    { id: 'd', cookedAt: '2024-01-01T00:00:00.000Z', rating: 4 },
    { id: 'e', cookedAt: '2024-01-02T00:00:00.000Z', rating: 4 },
    { id: 'f', cookedAt: '2024-01-03T00:00:00.000Z', rating: 5 },
  ]);
  assert.equal(rounded.avgCookedRating, 4.3);
});

test('computeCookedSearchFields joins cooked notes and trims', () => {
  const result = computeCookedSearchFields([
    { id: 'a', cookedAt: '2024-01-01T00:00:00.000Z', notes: '  too salty  ' },
    { id: 'b', cookedAt: '2024-01-02T00:00:00.000Z', notes: '' },
    { id: 'c', cookedAt: '2024-01-03T00:00:00.000Z', notes: 'reduce soy' },
  ]);
  assert.equal(result.cookedNotesText, 'too salty\nreduce soy');
});
