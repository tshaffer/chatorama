import type { HelpTopic } from '../types.js';

export const relations: HelpTopic = {
  slug: 'relations',
  title: 'Relations',
  category: 'Organization',
  order: 2,
  keywords: ['relations', 'links', 'connections', 'link notes', 'related', 'hub'],
  body: `Relations let you link notes together so you can surface connections across subjects and topics.

## What relations are

A relation is a directional or bidirectional link between two notes. You can use relations to:

- Connect a recipe note to technique notes it depends on.
- Link a project note to its reference notes.
- Track how ideas or conversations build on each other.

## Creating a relation

Open a note and look for the **Link** or **Add relation** action. A picker lets you search for and select the target note. The relation appears on both notes once created.

## The Relations page

The **Relations** page (toolbar → hub icon) shows a graph or list view of all linked notes, letting you explore connections across your entire knowledge base.

## Removing a relation

Open either note in the linked pair and use the **Remove relation** action next to the link you want to delete.`,
};
