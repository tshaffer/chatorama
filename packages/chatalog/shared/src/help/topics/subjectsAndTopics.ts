import type { HelpTopic } from '../types.js';

export const subjectsAndTopics: HelpTopic = {
  slug: 'subjects-and-topics',
  title: 'Subjects & Topics',
  category: 'Basics',
  order: 2,
  keywords: ['subject', 'topic', 'hierarchy', 'category', 'organize', 'structure', 'archive', 'archived', 'unarchive', 'hide'],
  body: `Chatalog organizes notes in a two-level hierarchy: **Subjects → Topics → Notes**.

## Subjects

A subject is the broadest grouping (e.g. "Cooking", "Work", "Travel"). Subjects appear in the left sidebar on the Notes page. Create and rename subjects in **Manage Hierarchy**.

## Topics

A topic lives inside a subject and groups related notes together (e.g. "Italian Recipes" inside "Cooking"). Each note belongs to exactly one topic. Topics appear as chips on a subject's card in Manage Hierarchy and as sections in the Notes page.

## Archiving subjects

Archive a subject you don't need for now: click **Archive subject** on its overview page, or the box icon on its card in **Manage Hierarchy**. Nothing is deleted or moved, and **Unarchive** restores it exactly as it was.

While a subject is archived:

- It sits in a collapsed **Archived** group at the bottom of the sidebar tree.
- It isn't offered in subject pickers, and nothing can be imported, moved, captured, or filed into it. Typing its name shows a message asking you to unarchive it first. Notes already in it can still be edited, and moved to another topic or out of it.
- Its notes still appear in search, tagged **archived**. Use \`archived:no\` to leave them out or \`archived:only\` to show only them (also under **Add filters…**).
- **Ask Claude** across all notes leaves its notes out.
- Links and bookmarks to it keep working. Its pages show a banner with an **Unarchive** button.

## Navigating the hierarchy

- **Notes page** — shows subjects in the left sidebar; selecting a subject reveals its topics and notes.
- **Subject index** — a flat view of all subjects.
- **Manage Hierarchy** — the admin view for creating, renaming, reordering, and deleting subjects and topics.

## URLs

Each subject and topic has a stable URL slug. Navigating to a topic URL (e.g. \`/s/cooking-..../t/italian-recipes-...\`) opens that topic's notes directly.`,
};
