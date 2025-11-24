// src/features/subjects/ReorderSubjectsDialog.tsx
import ReorderItemsDialog, {
  type ReorderItem,
} from '../../components/ReorderItemsDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Current subjects, in current order */
  subjects: ReorderItem[];
  /** Called with the new ordering of subject ids when user clicks Save */
  onSave: (orderedIds: string[]) => void | Promise<void>;
  loading?: boolean;
};

export default function ReorderSubjectsDialog({
  open,
  onClose,
  subjects,
  onSave,
  loading,
}: Props) {
  return (
    <ReorderItemsDialog
      open={open}
      onClose={onClose}
      items={subjects}
      title="Reorder subjects"
      emptyMessage="No subjects to reorder."
      helperText="Drag subjects to reorder them."
      onSave={onSave}
      loading={loading}
    />
  );
}

export type { ReorderItem };
