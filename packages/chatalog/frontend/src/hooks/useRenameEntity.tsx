import { useState, useCallback } from 'react';
import RenameDialog from '../components/RenameDialog';
import { useRenameSubjectMutation, useRenameTopicMutation } from '../features/subjects/subjectsApi';

type RenameTarget =
  | { kind: 'subject'; subjectId: string; currentName: string }
  | { kind: 'topic'; subjectId: string; topicId: string; currentName: string };

/**
 * Usage:
 * const { open: openRename, dialog: renameDialog } = useRenameEntity();
 * openRename({ kind:'subject', subjectId, currentName });
 * ...
 * {renameDialog}
 */
export function useRenameEntity() {
  const [target, setTarget] = useState<RenameTarget | null>(null);
  const [renameSubject] = useRenameSubjectMutation();
  const [renameTopic] = useRenameTopicMutation();

  const open = useCallback((t: RenameTarget) => setTarget(t), []);
  const close = useCallback(() => setTarget(null), []);

  const dialog = target ? (
    <RenameDialog
      open={!!target}
      entityLabel={target.kind === 'subject' ? 'Subject' : 'Topic'}
      initialName={target.currentName}
      defaultPreserveSlug={true}
      onCancel={close}
      onConfirm={async (newName, preserveSlug) => {
        if (target.kind === 'subject') {
          await renameSubject({ subjectId: target.subjectId, name: newName, preserveSlug }).unwrap();
        } else {
          await renameTopic({ subjectId: target.subjectId, topicId: target.topicId, name: newName, preserveSlug }).unwrap();
        }
        close();
      }}
    />
  ) : null;

  return { open, dialog };
}

export type { RenameTarget };
