import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeIngredient } from '../ingredientTokens';

test('canonicalizeIngredient strips numbers/units/stopwords and keeps key tokens', () => {
  const tokens = canonicalizeIngredient('1 1/2 tsp freshly ground black pepper');
  assert(tokens.includes('pepper'));
  assert(tokens.includes('black pepper'));
  assert(!tokens.some((t) => /\d/.test(t)));
  assert(!tokens.includes('tsp'));
  assert(!tokens.includes('freshly'));
});

test('canonicalizeIngredient drops filler lines', () => {
  const tokens = canonicalizeIngredient('for serving');
  assert.equal(tokens.length, 0);
});

test('canonicalizeIngredient handles hyphenated phrases', () => {
  const tokens = canonicalizeIngredient('Red-pepper flakes');
  assert(tokens.includes('red pepper'));
});

test('canonicalizeIngredient keeps olive oil phrases', () => {
  const tokens = canonicalizeIngredient('extra-virgin olive oil');
  assert(tokens.includes('olive'));
  assert(tokens.includes('oil'));
  assert(tokens.includes('olive oil'));
});

test('canonicalizeIngredient strips parentheticals and brand notes', () => {
  const tokens = canonicalizeIngredient(
    '1 tablespoon kosher salt, such as Diamond Crystal (or 1 3/4 teaspoons coarse kosher salt)',
  );
  assert(tokens.includes('kosher'));
  assert(tokens.includes('salt'));
  assert(tokens.includes('kosher salt'));
  assert(!tokens.includes('diamond'));
  assert(!tokens.includes('crystal'));
  assert(!tokens.includes('coarse'));
  assert(!tokens.includes('coarse kosher'));
});

test('canonicalizeIngredient drops descriptor-only singles', () => {
  const tokens = canonicalizeIngredient('1 tablespoon dried oregano');
  assert(tokens.includes('oregano'));
  assert(tokens.includes('dried oregano'));
  assert(!tokens.includes('dried'));
});

test('canonicalizeIngredient does not emit unsmoked', () => {
  const tokens = canonicalizeIngredient('1 tablespoon smoked paprika');
  assert(tokens.includes('smoked paprika'));
  assert(!tokens.some((t) => t.includes('unsmoked')));
});
