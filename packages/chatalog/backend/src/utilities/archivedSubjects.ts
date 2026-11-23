import { SubjectModel } from '../models/Subject';

/** Thrown when something would be added to an archived subject. */
export class ArchivedSubjectError extends Error {
  status = 409;
  constructor(subjectName: string) {
    super(`Subject “${subjectName}” is archived. Unarchive it in Manage Hierarchy first.`);
    this.name = 'ArchivedSubjectError';
  }
}

export function isArchivedSubject(subject: { archivedAt?: Date | null } | null | undefined): boolean {
  return !!subject?.archivedAt;
}

export function assertSubjectNotArchived(subject: { name: string; archivedAt?: Date | null } | null | undefined) {
  if (subject && isArchivedSubject(subject)) throw new ArchivedSubjectError(subject.name);
}

/** Ids (as strings, matching Note.subjectId) of every archived subject. */
export async function getArchivedSubjectIds(): Promise<string[]> {
  const docs = await SubjectModel.find({ archivedAt: { $ne: null } }).select({ _id: 1 }).lean();
  return docs.map((d) => String(d._id));
}

/** Names of the given subject names that belong to archived subjects. */
export async function findArchivedSubjectNames(names: string[]): Promise<string[]> {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (!unique.length) return [];
  const docs = await SubjectModel.find({ name: { $in: unique }, archivedAt: { $ne: null } })
    .select({ name: 1 })
    .lean();
  return docs.map((d) => d.name);
}
