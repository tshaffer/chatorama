import type { RecipeIngredient } from '@chatorama/chatalog-shared';

export type IngredientDiffModified = {
  kind: 'modified';
  index: number;
  original: string;
  current: string;
};

export type IngredientDiffDeleted = {
  kind: 'deleted';
  index: number;
  original: string;
};

export type IngredientDiffAdded = {
  kind: 'added';
  index: number;
  current: string;
};

export type IngredientDiffItem =
  | IngredientDiffModified
  | IngredientDiffDeleted
  | IngredientDiffAdded;

export type IngredientDiffGroups = {
  modified: IngredientDiffModified[];
  deleted: IngredientDiffDeleted[];
  added: IngredientDiffAdded[];
};

const norm = (s?: string) => (s ?? '').trim();

export function computeIngredientDiffGroups(params: {
  original: RecipeIngredient[];
  edited: RecipeIngredient[] | null;
}): IngredientDiffGroups {
  const { original, edited } = params;

  if (!edited) return { modified: [], deleted: [], added: [] };

  const modified: IngredientDiffModified[] = [];
  const deleted: IngredientDiffDeleted[] = [];
  const added: IngredientDiffAdded[] = [];

  const baseLen = original.length;

  for (let i = 0; i < baseLen; i += 1) {
    const o = norm(original[i]?.raw);
    const eObj = edited[i];
    const isDeleted = Boolean(eObj?.deleted);
    const c = isDeleted ? '' : norm(eObj?.raw);

    if (isDeleted) {
      if (o) deleted.push({ kind: 'deleted', index: i, original: o });
      continue;
    }

    if (o && c && o !== c) {
      modified.push({ kind: 'modified', index: i, original: o, current: c });
    }
  }

  for (let i = baseLen; i < edited.length; i += 1) {
    const eObj = edited[i];
    if (!eObj || eObj.deleted) continue;
    const c = norm(eObj.raw);
    if (!c) continue;
    added.push({ kind: 'added', index: i, current: c });
  }

  return { modified, deleted, added };
}
