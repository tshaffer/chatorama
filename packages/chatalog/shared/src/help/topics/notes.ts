import type { HelpTopic } from '../types.js';

export const notes: HelpTopic = {
  slug: 'notes',
  title: 'Notes',
  category: 'Content',
  order: 1,
  keywords: ['note', 'create', 'edit', 'delete', 'markdown', 'content', 'draft', 'status', 'image', 'png', 'jpg', 'picture', 'photo', 'screenshot', 'insert image', 'consolidate', 'summarize', 'archive', 'archived', 'combine', 'merge', 'ask claude', 'question', 'suggestions', 'summary', 'compare', 'contradictions', 'plan these changes', 'make these changes', 'apply changes', 'reorganize', 'undo', 'conversation', 'continue', 'resume', 'set aside', 'ask all', 'all notes', 'whole library', 'find all', 'search with ai'],
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

## Asking Claude about notes

**Ask Claude** lets you ask a question about one or more notes and get an answer, without changing the notes. Use it for things like a summary, suggestions for improving the notes, or finding contradictions.

1. In a topic, select the notes you want to ask about and click **Ask Claude**. With nothing selected, it asks about every note in the topic. On a note's page, **Ask Claude** asks about that note.
2. Type a question, or pick one or more suggestions above the question box, such as **Summarize**, **Suggest improvements**, or **What's missing?**, and click **Ask**. Picked suggestions are asked together, along with anything you type. The suggestions stay available for follow-up questions. The answer appears as it's written; **Stop** ends it early.
3. Ask follow-up questions to continue the conversation. Claude cites the notes it used as numbers like [2]; click a number or a **Sources** chip to open that note in a new tab.
4. Under any answer:
   - **Copy** copies it to the clipboard.
   - **Save as note** saves it as a new note in the same topic, with your question at the top and a link back to the notes it was about.
   - **Plan these changes…** has Claude turn the conversation into changes to your notes (see below).
   - **Consolidate with this** (topic page only) opens Consolidate on the same notes with the answer as its instructions, for example to apply Claude's suggestions.

Recipes and PDF notes can be included; Claude reads the recipe text or the PDF's summary.

### Continuing a conversation later

Conversations are saved after each answer, so you can close the dialog and pick up where you left off. In the topic, click **Show conversations with Claude** below the note list, then **Continue** on a conversation. Conversations started from a note's page are listed in that note's topic. **Rename** changes a conversation's title (the first question, to start with), and **Delete** removes it permanently without affecting notes saved from it.

When you continue a conversation, Claude reads the notes as they are now. Notes edited since the last answer are marked **Changed since**, as a reminder that earlier answers may be out of date. Notes that were archived or moved to another topic are left out.

## Asking Claude about all your notes

To ask about your whole library instead of notes you pick, click the **Ask Claude about all your notes** button (the sparkle icon) in the top bar. Ask something like "Find all the notes that mention backing up an application database."

There are too many notes for Claude to read them all, so it searches for the ones it needs, by keyword and by meaning, and reads the promising ones in full. When you ask for *all* the notes about something, it tries several wordings. While it works you'll see what it's doing, and under each question a line such as "Searched for “database backup”, “mongodump” · read 9 notes" shows what it looked at.

Claude can still miss a note that's worded unusually. If one you know about is missing, ask it to search for more, for example "also search for Atlas snapshots", or pick the **Search more** suggestion.

The notes Claude reads are numbered for the rest of the conversation and listed under **Notes found**, with their subject and topic. Follow-up questions can refer to them ("combine notes 2, 5 and 7"), and Claude searches again when it needs to.

Under each answer, **Copy**, **Save as note**, and **Plan these changes…** work as above, with these differences:

- **Save as note** asks which subject and topic to save the note in. It suggests the topic of the first note the answer cites.
- **Plan these changes…** can edit and archive notes in different subjects and topics. For each new note, Claude suggests a subject and topic, which you can change in the review before applying.

After you apply changes, the conversation stays open, and a record of what changed appears in it, such as "Archived “Backups throughout workflow” [3]" or "Created “Backup and restore” in Chatalog / Backup [8]". New notes get numbers too. Claude is told about the changes with your next question, so you can keep going, for example "what did you change?" or "now shorten note 8". Click **Undo** on the record to undo them; the undo is recorded too. You can also undo later from **Show changes made with Claude** on the page of any topic they changed. **Plan these changes…** is offered only on answers after the most recent changes.

Conversations are saved here too. To continue one, open Ask Claude from the top bar and click **Show conversations with Claude**. Notes that were archived or deleted since keep their numbers, marked **Archived** or **Deleted**, so earlier answers still point to the right notes, and Claude knows they're no longer current and won't plan changes to them.

Each question costs more than Ask Claude on a topic, because Claude reads more notes. It's billed to the Claude API key the app uses.

## Making changes with Claude

After discussing your notes with Claude, for example asking which notes to combine, rename, or remove, click **Plan these changes…** under an answer. Claude turns what you agreed on into a list of proposed changes for you to review:

- **New**: a new note in the same topic. Click **Show note** to preview it.
- **Edit**: a new title and/or new text for one of the notes. Click **Show changes** to see what changes, or **Preview** to see the result.
- **Archive**: a note that's no longer needed, with the note its content was merged into, if any. Notes are never deleted.

If Claude's last answer asks you something, such as details to check before making the changes, you can answer as part of the plan. Type your answers in the box at the bottom, then click **Plan these changes with your reply…** under that answer instead of **Ask**. Claude plans the changes with your answers taken into account, without writing another answer first.

Untick anything you don't want, or type a request such as "keep note 3 and just shorten it" and click **Revise** for a new plan. Click **Apply** to make the ticked changes. Nothing changes until you do.

Claude can only change the notes from the conversation, and new notes go in the same topic. (When asking about all your notes, see above.)

To undo, click **Undo** in the message that appears after applying. Later, use **Show changes made with Claude** below the topic's note list. Undo restores the edited and archived notes and archives any notes the changes created. If you've edited one of those notes since, Undo won't overwrite your edits; it tells you which note changed.

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
