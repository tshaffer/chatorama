import type { HelpTopic } from '../types.js';

export const subjectsAndTopics: HelpTopic = {
  slug: 'subjects-and-topics',
  title: 'Subjects & Topics',
  category: 'Basics',
  order: 2,
  keywords: ['subject', 'topic', 'hierarchy', 'category', 'organize', 'structure'],
  body: `Chatalog organizes notes in a two-level hierarchy: **Subjects → Topics → Notes**.

## Subjects

A subject is the broadest grouping (e.g. "Cooking", "Work", "Travel"). Subjects appear in the left sidebar on the Notes page. Create and rename subjects in **Manage Hierarchy**.

## Topics

A topic lives inside a subject and groups related notes together (e.g. "Italian Recipes" inside "Cooking"). Each note belongs to exactly one topic. Topics appear as chips on a subject's card in Manage Hierarchy and as sections in the Notes page.

## Navigating the hierarchy

- **Notes page** — shows subjects in the left sidebar; selecting a subject reveals its topics and notes.
- **Subject index** — a flat view of all subjects.
- **Manage Hierarchy** — the admin view for creating, renaming, reordering, and deleting subjects and topics.

## URLs

Each subject and topic has a stable URL slug. Navigating to a topic URL (e.g. \`/s/cooking-..../t/italian-recipes-...\`) opens that topic's notes directly.`,
};
