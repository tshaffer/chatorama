import type { HelpTopic } from '../types.js';

export const manageHierarchy: HelpTopic = {
  slug: 'manage-hierarchy',
  title: 'Manage Hierarchy',
  category: 'Organization',
  order: 1,
  keywords: ['manage', 'hierarchy', 'create', 'rename', 'delete', 'reorder', 'subject', 'topic', 'move topic'],
  body: `The **Manage Hierarchy** page (toolbar → grid icon) is the central place to administer your subjects and topics.

## Subjects

- **Create** — type a name in the "New subject" field and click **Add**, or press Enter.
- **Rename** — double-click a subject title to edit it inline.
- **Reorder** — click **Reorder subjects…** to drag subjects into your preferred order.
- **Delete** — click the trash icon on a subject card. Deleting a subject also deletes all its topics and notes.

## Topics

Each subject card shows its topics as chips.

- **Create** — type a name in the "New topic" field at the bottom of a subject card and click **Add topic**.
- **Rename** — double-click a topic chip to edit it inline.
- **Open** — single-click a topic chip to navigate to its notes page.
- **Move to another subject** — click the move icon (arrow) next to a topic chip and choose the destination subject.
- **Reorder** — click **Reorder…** (shown when there are 2+ topics) to drag topics into order within that subject.
- **Delete** — click the × on a topic chip. You'll see a count of notes that will also be deleted and a confirmation prompt.`,
};
