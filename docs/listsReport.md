# UI Lists Report (Frontend)

## Reorderable (explicit user-driven ordering)
- `packages/chatalog/frontend/src/pages/ManageHierarchy.tsx` — reorder dialogs for subjects/topics (via `ReorderItemsDialog`). Rationale: explicit drag-and-drop ordering by user.
- `packages/chatalog/frontend/src/features/notes/ReorderableNotesList.tsx` — notes list with drag reorder + selection. Rationale: manual ordering within a topic.
- `packages/chatalog/frontend/src/components/ReorderItemsDialog.tsx` — generic reorder list (used by subject/topic reorder dialogs). Rationale: drag-to-reorder control.
- `packages/chatalog/frontend/src/features/subjects/ReorderSubjectsDialog.tsx` — subjects reorder list (wrapper). Rationale: manual ordering of subjects.
- `packages/chatalog/frontend/src/features/subjects/ReorderTopicsDialog.tsx` — topics reorder list (wrapper). Rationale: manual ordering of topics within a subject.
- `packages/chatalog/frontend/src/features/notes/MergeNotesDialog.tsx` — ordered merge sequence list (user moves items up/down). Rationale: merge order determines final content sequence.

## Not Reorderable (display order is fixed, derived, or functional)

### Pages
- `packages/chatalog/frontend/src/pages/Home.tsx` — quick links: list of top subjects (first 3); topic chips list per subject (first 3 topics). Rationale: display subset from data order.
- `packages/chatalog/frontend/src/pages/ManageHierarchy.tsx` — subject cards list; topic chips list per subject. Rationale: display order from data (subjects/topics). 
- `packages/chatalog/frontend/src/pages/SubjectIndex.tsx` — topics list for subject; subject relations lists (related topics, related notes). Rationale: display order from data.
- `packages/chatalog/frontend/src/pages/QuickNotes.tsx` — list of quick notes. Rationale: display order from API response.
- `packages/chatalog/frontend/src/pages/TopicNotesPage.tsx` — related notes lists (subject-related + direct); incoming references lists (related topics + related notes); import history list (batches). Rationale: derived lists (relations) + import history sorted by date.
- `packages/chatalog/frontend/src/pages/RelationsPage.tsx` — table list of relation edges (source note, relation kind, target). Rationale: derived relations list.
- `packages/chatalog/frontend/src/features/search/SearchPage.tsx` — search results list; saved searches list (select + "Manage saved searches" list); filter chips lists (tags, cuisines, categories, keywords, include/exclude ingredients); filter dialog select/autocomplete option lists (subjects, topics, recipe facets, time/rating options, cooked filters). Rationale: search relevance; saved searches sorted by name; filter options reflect facet values or fixed option sets.

### Notes & Relations UI
- `packages/chatalog/frontend/src/features/notes/NoteEditor.tsx` — relations editor rows list; dropdown lists for target type, subject/topic/note target options, relation kind; subject/topic autocomplete option lists; image-size preset select list. Rationale: relations list reflects current note relations; option lists are fixed or data-driven.
- `packages/chatalog/frontend/src/features/notes/MoveNotesDialog.tsx` — subject and topic select option lists. Rationale: data-driven lists from API.
- `packages/chatalog/frontend/src/features/notes/NotePropertiesDialog.tsx` — tag chips list; sources list (source cards). Rationale: data order from note fields.
- `packages/chatalog/frontend/src/features/notes/CookedHistoryPanel.tsx` — cooked history list; rating select options. Rationale: history order from note data; rating options fixed.
- `packages/chatalog/frontend/src/features/relations/LinkNoteToTargetDialog.tsx` — note select list; relation kind select list. Rationale: notes sorted by title; kind options fixed.

### Subjects/Topics Pickers & Trees
- `packages/chatalog/frontend/src/features/subjects/SubjectTopicTree.tsx` — tree list of subjects and their topics. Rationale: data-driven hierarchy order.
- `packages/chatalog/frontend/src/components/SubjectTopicPickerDialog.tsx` — subject/topic autocomplete option lists. Rationale: data-driven options with current input included.
- `packages/chatalog/frontend/src/features/imports/ImportPdfDialog.tsx` — subject/topic autocomplete option lists. Rationale: data-driven options with current input included.

### Imports UI
- `packages/chatalog/frontend/src/features/imports/ImportResultsDialog.tsx` — imported notes table list; subject/topic autocomplete lists per row; existing hierarchy tree (subjects -> topics -> notes); conflicts table list. Rationale: imported rows in import order; hierarchy from data; conflicts from import analysis.

### Misc
- `packages/chatalog/frontend/src/components/MarkdownBody.tsx` — table of contents list of prompt turns. Rationale: order from parsed markdown turns.
- `packages/chatalog/frontend/src/features/quickNotes/QuickCaptureDialog.tsx` — subject/topic select option lists. Rationale: data-driven options.
- `packages/chatalog/frontend/src/pages/QuickNotePage.tsx` — image-size preset select list. Rationale: fixed option set.
