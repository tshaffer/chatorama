import type { HelpTopic } from '../types.js';

export const notes: HelpTopic = {
  slug: 'notes',
  title: 'Notes',
  category: 'Content',
  order: 1,
  keywords: ['note', 'create', 'edit', 'delete', 'markdown', 'content', 'draft', 'status', 'image', 'png', 'jpg', 'picture', 'photo', 'screenshot', 'insert image', 'consolidate', 'summarize', 'archive', 'archived', 'combine', 'merge'],
  body: `Notes are the primary content in Chatalog. Each note belongs to exactly one subject and topic.

## Creating a note

Navigate to a topic (via the Notes page or subject hierarchy) and use the **New note** button. Give the note a title and write the body in the Markdown editor.

## Editing a note

Open any note to enter the editor. Notes support full Markdown syntax including headings, bold/italic, lists, code blocks, and tables.

## Adding images

To add an image (PNG, JPG, or other image file) to a subject/topic, put it in a note in that topic:

1. Navigate to the topic and open an existing note, or create a new one.
2. Click **Edit**, then **Insert Image...**, and choose the image file.

The image is uploaded, attached to the note, and inserted into the note body at the cursor as Markdown. Because the note belongs to a subject and topic, the image does too. **Insert Image...** is not available on PDF notes.

## Consolidating notes

**Consolidate** uses Claude to rewrite several overlapping notes as one organized note without repetition, for example a run of saved chat turns on the same subject.

1. In a topic, select one or more notes and click **Consolidate**.
2. Optionally reorder the notes (later notes win when they conflict) and add instructions, or click a suggestion such as **Shorter** or **Use tables**. With no instructions, Claude merges duplicates, keeps the final state of anything that changed, drops chat filler, and organizes the result with headings, lists, and tables.
3. Click **Generate**. The draft appears as it's written; **Stop** ends it early.
4. Type a request in **Refine** to get a revised version, or switch to **Edit Markdown** to change it yourself. Each version (v1, v2, …) is kept, so you can go back to an earlier one.
5. Check the suggested title and click **Save as note**. The new note is added to the same topic.

**Merge**, by contrast, joins the selected notes' text as-is into the first note and deletes the others.

## Archived notes

When you save a consolidated note, its source notes are archived unless you uncheck **Archive the source notes**. Archived notes:

- are hidden from the topic's note list (click **Show archived** below the list to see them), and from Search and Ask;
- are listed under **Consolidated from N notes** on the new note;
- show a banner linking to the note that replaced them.

Click **Unarchive** (in the archived list or on the note's banner) to restore one. Right after saving, **Undo archive** in the confirmation message restores them all.

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
