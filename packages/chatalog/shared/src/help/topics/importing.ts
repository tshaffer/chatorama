import type { HelpTopic } from '../types.js';

export const importing: HelpTopic = {
  slug: 'importing',
  title: 'Importing',
  category: 'Getting Content In',
  order: 1,
  keywords: ['import', 'chatworthy', 'pdf', 'markdown', 'google docs', 'upload', 'chatgpt', 'conversation'],
  body: `Chatalog can import content from several sources. Import buttons are in the top toolbar.

## From Chatworthy (ChatGPT conversations)

The **Chatworthy** Chrome extension exports selected ChatGPT conversations to Chatalog. Install Chatworthy, select the prompts you want to save, and click **Export to Chatalog**. A subject and topic selection dialog appears in Chatalog to assign the imported notes.

## From PDF

Click the **Import PDF** icon in the toolbar. Select a PDF file from your computer. Chatalog extracts the text and creates a note, which you then assign to a subject and topic.

## From Markdown

Click the **Import file** icon in the toolbar and select a \`.md\` file. The Markdown content is imported as a note body.

## From Google Docs

Click the **Import Google Doc** icon (cloud download) in the toolbar. Paste a Google Doc URL or select a file. The document content is fetched and created as a note.

## After importing

All imported notes land in the subject and topic you chose at import time. You can move them later via the **Move Notes** action.`,
};
