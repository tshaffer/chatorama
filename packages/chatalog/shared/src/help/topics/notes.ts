import type { HelpTopic } from '../types.js';

export const notes: HelpTopic = {
  slug: 'notes',
  title: 'Notes',
  category: 'Content',
  order: 1,
  keywords: ['note', 'create', 'edit', 'delete', 'markdown', 'content', 'draft', 'status'],
  body: `Notes are the primary content in Chatalog. Each note belongs to exactly one subject and topic.

## Creating a note

Navigate to a topic (via the Notes page or subject hierarchy) and use the **New note** button. Give the note a title and write the body in the Markdown editor.

## Editing a note

Open any note to enter the editor. Notes support full Markdown syntax including headings, bold/italic, lists, code blocks, and tables.

## Note properties

Each note has:
- **Title** — a short label shown in lists.
- **Body** — the main content, written in Markdown.
- **Subject / Topic** — where the note lives in the hierarchy.
- **Tags** — optional keywords for filtering and searching.
- **Status** — tracks the editorial state of the note.

## Moving a note

Use **Move Notes** (available in topic view or the note's action menu) to reassign one or more notes to a different subject and topic.

## Deleting a note

Open the note's action menu and choose **Delete**. Deletion is permanent — there is no trash or undo.

## Recipes

A special note kind called **Recipe** lets you store a structured recipe with ingredients, steps, and cook-time information in addition to the usual markdown body.`,
};
