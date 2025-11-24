// src/features/subjects/ReorderTopicsDialog.tsx
import ReorderItemsDialog, {
  type ReorderItem,
} from '../../components/ReorderItemsDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  subjectName: string;
  /** Topics for this subject, in current order */
  topics: ReorderItem[];
  /** Called with the new ordering of topic ids when user clicks Save */
  onSave: (orderedTopicIds: string[]) => void | Promise<void>;
  loading?: boolean;
};

export default function ReorderTopicsDialog({
  open,
  onClose,
  subjectName,
  topics,
  onSave,
  loading,
}: Props) {
  return (
    <ReorderItemsDialog
      open={open}
      onClose={onClose}
      items={topics}
      title={`Reorder topics in “${subjectName}”`}
      emptyMessage="No topics to reorder."
      helperText="Drag topics to reorder them."
      onSave={onSave}
      loading={loading}
    />
  );
}
