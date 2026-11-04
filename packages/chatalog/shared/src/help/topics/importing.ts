import type { HelpTopic } from '../types.js';

export const importing: HelpTopic = {
  slug: 'importing',
  title: 'Importing',
  category: 'Getting Content In',
  order: 1,
  keywords: ['import', 'chatworthy', 'pdf', 'markdown', 'google docs', 'upload', 'chatgpt', 'conversation', 'send to chatalog', 'image', 'png', 'jpg', 'picture'],
  body: `Chatalog can import content from several sources. Import buttons are in the top toolbar.

## From Chatworthy (ChatGPT conversations)

The **Chatworthy** Chrome extension exports selected prompts from AI chats to Chatalog. Install Chatworthy, select the prompts you want to save, and click **Send to Chatalog**. Chatalog comes to the front, using a tab that's already open or a new one if there isn't one, and opens the import review, where you assign the notes to a subject and topic. Nothing is saved until you apply it there.

If Chatalog isn't running, Chatworthy offers to download the export as a file instead. To save a file without sending it, click **Export**, then use the **Import file** button in Chatalog's toolbar.

## From PDF

Click the **Import PDF** icon in the toolbar. Select a PDF file from your computer. Chatalog extracts the text and creates a note, which you then assign to a subject and topic.

## From Markdown

Click the **Import file** icon in the toolbar and select a \`.md\` file. The Markdown content is imported as a note body.

## From Google Docs

Click the **Import Google Doc** icon (cloud download) in the toolbar. Paste a Google Doc URL or select a file. The document content is fetched and created as a note.

## Images (PNG, JPG, etc.)

Image files can't be imported on their own with **Import file**. To add an image to a subject/topic, open or create a note in that topic, click **Edit**, then **Insert Image...** (see the Notes help topic). Quick Capture also has an **Insert Image...** button.

## After importing

All imported notes land in the subject and topic you chose at import time. You can move them later via the **Move Notes** action.`,
};
