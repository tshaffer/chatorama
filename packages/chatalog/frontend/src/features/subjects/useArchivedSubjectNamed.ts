import { useMemo } from 'react';
import { isSubjectArchived, useGetSubjectsQuery } from './subjectsApi';

/** Message shown wherever an archived subject's name is entered as a destination. */
export function archivedSubjectMessage(name: string): string {
  return `“${name}” is archived. Unarchive it in Manage Hierarchy first.`;
}

/**
 * The archived subject whose name is exactly `label` (trimmed), if any.
 * Nothing can be added to an archived subject, and a new subject can't take
 * its name, so a picker blocks the action while this returns a name.
 */
export function useArchivedSubjectNamed(label: string | undefined): string | undefined {
  const { data: subjects } = useGetSubjectsQuery();
  return useMemo(() => {
    const trimmed = (label ?? '').trim();
    if (!trimmed) return undefined;
    return subjects?.find((s) => isSubjectArchived(s) && s.name?.trim() === trimmed)?.name;
  }, [subjects, label]);
}

/** Thrown when an edit would move something into an archived subject. */
export class ArchivedSubjectTargetError extends Error {
  constructor(name: string) {
    super(archivedSubjectMessage(name));
    this.name = 'ArchivedSubjectTargetError';
  }
}
