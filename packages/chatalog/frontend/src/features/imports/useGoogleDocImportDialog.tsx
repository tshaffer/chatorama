import { useState } from 'react';
import ImportGoogleDocDialog from './ImportGoogleDocDialog';

export type GoogleDocImportDefaults = {
  subjectId?: string;
  topicId?: string;
};

type Options = {
  onImported?: (noteId: string) => void;
};

export function useGoogleDocImportDialog(options: Options = {}) {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<GoogleDocImportDefaults>({});

  const openImport = (nextDefaults?: GoogleDocImportDefaults) => {
    setDefaults(nextDefaults ?? {});
    setOpen(true);
  };

  const dialog = (
    <ImportGoogleDocDialog
      open={open}
      onClose={() => setOpen(false)}
      onImported={options.onImported}
      defaultSubjectId={defaults.subjectId}
      defaultTopicId={defaults.topicId}
    />
  );

  return { openImport, dialog };
}
