# Migration Notes

## Note text index v4
- Drop old index: `mongosh -q --eval 'db.notes.dropIndex(\"notes_text_search_v3\")' <db>`
- Create new index: `mongosh -q --eval 'db.notes.createIndex({ title: \"text\", tags: \"text\", markdown: \"text\", pdfSummaryMarkdown: \"text\", \"derived.pdf.extractedText\": \"text\", \"derived.googleDoc.textPlain\": \"text\", \"recipe.search.cookedNotesText\": \"text\" }, { name: \"notes_text_search_v4\", weights: { title: 10, tags: 3, pdfSummaryMarkdown: 2, \"derived.pdf.extractedText\": 1, \"derived.googleDoc.textPlain\": 1, markdown: 1, \"recipe.search.cookedNotesText\": 2 }, default_language: \"english\" })' <db>`
