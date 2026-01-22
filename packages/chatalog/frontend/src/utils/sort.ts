// packages/chatalog/frontend/src/utils/sort.ts

export function compareTextCI(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

export function sortByStringKeyCI<T>(
  items: readonly T[],
  getKey: (item: T) => string | undefined | null
): T[] {
  return [...items].sort((x, y) => compareTextCI(getKey(x) ?? '', getKey(y) ?? ''));
}

export function sortStringsCI(items: readonly string[]): string[] {
  return [...items].sort(compareTextCI);
}
