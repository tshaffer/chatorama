import type { HelpTopic } from '../types.js';

export const gettingStarted: HelpTopic = {
  slug: 'getting-started',
  title: 'Getting Started',
  category: 'Basics',
  order: 1,
  keywords: ['overview', 'introduction', 'workflow', 'start', 'what is chatalog'],
  body: `Chatalog is a personal knowledge base for saving, organizing, and searching notes and conversations.

## Core concepts

- **Subjects** — top-level categories (e.g. "Cooking", "Work", "Travel").
- **Topics** — sub-categories within a subject (e.g. "Italian Recipes" inside "Cooking").
- **Notes** — individual pieces of content, each belonging to one subject and topic.

## Basic workflow

1. Create a subject in **Manage Hierarchy**.
2. Add one or more topics under that subject.
3. Navigate to a topic and create notes inside it.
4. Use **Search** to find notes across all subjects and topics.
5. Use **Quick Notes** to capture something fast when you don't know yet where it belongs.

The navigation bar at the top gives you access to Notes, Quick Notes, Manage Hierarchy, and Relations from anywhere in the app.`,
};
