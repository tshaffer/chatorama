import type { HelpTopic } from '../types.js';

export const searching: HelpTopic = {
  slug: 'searching',
  title: 'Searching',
  category: 'Finding Things',
  order: 1,
  keywords: ['search', 'filter', 'find', 'query', 'tag', 'scope', 'date', 'subject', 'topic'],
  body: `The search bar at the top of every page lets you find notes quickly across your entire archive.

## Basic search

Type any words into the search bar and press **Enter** (or click the search icon). Chatalog searches note titles and bodies.

## Scoping the search

Use the \`scope:\` keyword to narrow results:

| Syntax | What it searches |
|---|---|
| \`scope:notes\` | Regular notes only (default) |
| \`scope:recipes\` | Recipe notes only |
| \`scope:all\` | Notes and recipes |

Example: \`scope:recipes pasta\` finds recipes mentioning "pasta".

## Filtering by tag

Use \`tags:tag1,tag2\` to filter by one or more tags. Example: \`tags:vegetarian,italian\`.

## Filtering by subject or topic

When you're already on a subject or topic page and trigger a search, the scope is automatically limited to that context.

## Filtering by status

Use \`status:draft\` or \`status:published\` to filter by note status.

## Date filters

Use \`updatedFrom:YYYY-MM-DD\` and \`updatedTo:YYYY-MM-DD\` to find notes modified within a date range.

## Saved searches

After running a search, save it for quick re-use via the **Save search** button on the search results page.`,
};
