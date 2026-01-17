import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePowerQuery } from '../powerQueryParser';

test('parsePowerQuery handles unquoted terms', () => {
  const parsed = parsePowerQuery('high protein');
  assert.deepEqual(parsed.terms, ['high', 'protein']);
  assert.deepEqual(parsed.phrases, []);
});

test('parsePowerQuery handles quoted phrases', () => {
  const parsed = parsePowerQuery('"high protein"');
  assert.deepEqual(parsed.phrases, ['high protein']);
  assert.deepEqual(parsed.terms, []);
});

test('parsePowerQuery handles OR', () => {
  const parsed = parsePowerQuery('high OR protein');
  assert.deepEqual(parsed.anyTerms, ['high', 'protein']);
  assert.equal(parsed.hasExplicitOr, true);
});

test('parsePowerQuery handles NOT', () => {
  const parsed = parsePowerQuery('protein -high');
  assert.deepEqual(parsed.terms, ['protein']);
  assert.deepEqual(parsed.notTerms, ['high']);
});
