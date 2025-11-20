You are transforming structured data, not summarizing or sampling.

The attached file (e.g. ai-seed-v2.json) contains a top-level object with a property notes, which is an array of note objects.

Each input note has fields including:

aiNoteKey

chatworthyNoteId

fileName

subjectHint (optional)

topicHint (optional)

chatTitle (optional)

turnIndex (number)

promptText (the user’s question / prompt)

responseText (the assistant’s answer)

You also have a separate file (e.g. ai-hierarchy-for-ai-v2.json) that contains an existing list of Subjects and Topics. You should reuse those Subjects and Topics whenever possible, and only propose new ones when truly necessary.

Your task is to classify EACH note into a Subject and Topic, and to propose a short, human-friendly title.

You MUST respond with a SINGLE JSON OBJECT ONLY — no explanation, no Markdown code fences, no headings, and no extra properties. The JSON MUST have exactly these top-level properties:

{
  "version": 2,
  "generatedAt": "<ISO date string>",
  "subjects": [ ... ],
  "topics": [ ... ],
  "notes": [ ... ]
}


Because the JSON may be large, you should prefer returning it as a downloadable JSON file attachment (if the interface supports that). If you cannot return a file, then print the JSON inline in the chat.

SUBJECTS FORMAT

The "subjects" array MUST contain only the new or changed Subjects you are proposing.
If you don’t need any new subjects, use an empty array:

"subjects": []


Each subject MUST have this shape:

{
  "name": "<Human-readable subject name>"
}


Constraints:

Use human-friendly labels, e.g. "Personal Health & Nutrition".

Do NOT include IDs here; just the "name".

Reuse existing subjects from ai-hierarchy-for-ai-v2.json by name; only add a subject here if you truly need a new one.

Do NOT include any other fields.

TOPICS FORMAT

The "topics" array MUST contain only the new or changed Topics you are proposing.
If you don’t need any new topics, use an empty array:

"topics": []


Each topic MUST have this shape:

{
  "subjectName": "<an existing or newly proposed subject name>",
  "name": "<Human-readable topic name>"
}


Constraints:

subjectName MUST be either:

The "name" of an existing subject from ai-hierarchy-for-ai-v2.json, or

The "name" of a subject you listed in the "subjects" array above.

name is a human-friendly label for the topic, e.g. "Cycling Fueling, Carbs, and Energy Systems".

Do NOT include any other fields.

Reuse topics across multiple notes by name when appropriate; avoid near-duplicates.

NOTES FORMAT (CRITICAL)

The "notes" array in your OUTPUT is where you map each input note to a subject/topic and a suggested title.

The OUTPUT "notes" array MUST:

Have the SAME LENGTH as the input notes array.

Include EVERY aiNoteKey from the input.

Contain EXACTLY ONE output entry per input note.

Never merge, drop, or sample notes.

Each output note MUST have this exact shape:

{
  "aiNoteKey": "<copied from input note>",
  "subjectName": "<chosen subject name>",
  "topicName": "<chosen topic name>",
  "suggestedTitle": "<short human-friendly title for this note>"
}


Constraints:

aiNoteKey MUST exactly match the input note’s aiNoteKey.

subjectName MUST be either:

An existing subject name from ai-hierarchy-for-ai-v2.json, or

A subject name you’ve added in the "subjects" array.

topicName MUST be either:

An existing topic name under that subject from ai-hierarchy-for-ai-v2.json, or

A topic name you’ve added in the "topics" array under that subject.

TITLE GUIDELINES (VERY IMPORTANT)

For each "suggestedTitle":

Make it a short, human-friendly summary of the main idea of the note.

Base it on the content (promptText + responseText), not just the hints.

Do NOT copy or truncate the user’s prompt verbatim.

Prefer declarative titles, e.g.:

Good: "Pasta Timing Around Moderate Exercise for Blood Sugar Control"

Bad: "Let's assume that I want to eat pasta"

Avoid meta phrases like "turn 3", "this revised version", "as discussed above", "you wrote", etc.

Aim for about 5–12 words.

Forbidden patterns (do NOT use them under any circumstances):

Do NOT include the word "Turn" anywhere in the title.

Do NOT include parentheses like "(Turn 3)" or any similar meta suffix.

Do NOT copy fileName, chatTitle, subjectHint, or topicHint verbatim into the title.

You may reuse individual words (e.g., "cheese", "heart health"), but the title MUST NOT just be those strings with minor tweaks.

If multiple notes share the same fileName (i.e., multiple turns in one chat), the titles MUST be distinct, focusing on what is unique about that turn.

Examples:

Bad: "I just finished a 90 minute cycling session"
Good: "Refueling After a 90-Minute Moderate Cycling Session"

Bad: "Let's assume that I want to eat pasta"
Good: "Small Pasta Portions Around Low-Intensity Exercise"

Bad: "Heart Health Ranking Best Worst (Turn 1)"
Good:

"Criteria for Heart-Healthier Cheese Choices"

"Nutrition Comparison Table for Nine Common Cheeses"

"Is Cheddar Worse Than Brie for Heart Health?"

"Heart-Health Assessment of Burrata Cheese"

"Updated Cheese Ranking Including Burrata and Gouda"

VALIDATION BEFORE YOU RESPOND

Before you send your final JSON:

Confirm the top-level structure is exactly:
version, generatedAt, subjects, topics, notes.

Confirm that:

version is the number 2.

"subjects" objects use only:

{ "name": "..." }


"topics" objects use only:

{ "subjectName": "...", "name": "..." }


"notes" objects use only:

{ "aiNoteKey", "subjectName", "topicName", "suggestedTitle" }


Confirm that:

The output "notes" array length is exactly the same as the input "notes" array length.

Every aiNoteKey from the input appears exactly once in the output "notes".

Finally, write this single JSON object into a file (for example ai-classification-batch-2.json) and return it to me as a downloadable file. Do NOT print the JSON inline unless you absolutely cannot return a file.
