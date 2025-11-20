You are transforming structured data, not summarizing or sampling.

The attached file (e.g. ai-seed-v1.json) contains a top-level object with a property notes, which is an array of note objects.

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

For EACH input note in notes, you must produce EXACTLY ONE output entry in the notes array of your response.

You MUST respond with a SINGLE JSON OBJECT ONLY —
no explanation, no Markdown code fences, no commentary.

The JSON MUST have exactly these top-level properties:

{
  "version": 1,
  "subjects": [ ... ],
  "topics": [ ... ],
  "topicRelations": [ ... ],
  "notes": [ ... ]
}


Because the JSON will be large, you MUST NOT print it directly in the chat. Instead, create a JSON file named ai-classification-v1.json containing that single JSON object, and return it to me as a downloadable file attachment. If for some reason you cannot create a downloadable file, then and only then print the JSON inline.

SUBJECTS FORMAT

The "subjects" array MUST contain objects of this shape:

{
  "id": "S-<slug>",
  "name": "<Human-readable subject name>"
}


Constraints:

"id" starts with "S-" and then a short kebab-case slug
e.g. "S-personal-health-nutrition"

"name" is human-friendly
e.g. "Personal Health & Nutrition"

Do NOT include any other fields

Reuse subjects across notes; do NOT create a subject per note unless necessary

Infer subjects from subjectHint, topicHint, chatTitle, promptText, and responseText

TOPICS FORMAT

The "topics" array MUST contain objects of this shape:

{
  "id": "T-<slug>",
  "subjectId": "<subject id>",
  "name": "<Human-readable topic name>"
}


Constraints:

"id" starts with "T-" and then a short kebab-case slug
e.g. "T-on-ride-fuel-bars-vs-fruit"

"subjectId" MUST reference an "id" from "subjects"

"name" is a human-friendly topic label

Do NOT include other fields

Reuse topics; avoid redundant near-duplicate topics

Infer topics from all hints and content (subjectHint, topicHint, chatTitle, promptText, responseText)

TOPIC RELATIONS FORMAT (optional but recommended)

Each "topicRelations" entry MUST be:

{
  "sourceTopicId": "<topic id>",
  "targetTopicId": "<topic id>",
  "kind": "<relation kind>"
}


Constraints:

Both IDs must appear in "topics"

"kind" is a short label like "see-also", "also-about", "supports"

If none, return:

"topicRelations": []


NOTES FORMAT (CRITICAL)

The output "notes" array maps each input note to a subject/topic/title.

It MUST:

Have the SAME LENGTH as the input notes array

Include EVERY aiNoteKey

Produce EXACTLY ONE output entry per input note

Each output note MUST have this shape:

{
  "aiNoteKey": "<copied from input>",
  "chatworthyNoteId": "<copied from input>",
  "fileName": "<copied from input>",
  "subjectId": "<id from subjects[]>",
  "topicId": "<id from topics[]>",
  "suggestedTitle": "<short human-friendly title>"
}


Constraints:

aiNoteKey, chatworthyNoteId, fileName MUST be copied literally from the input note

subjectId MUST exist in "subjects"

topicId MUST exist in "topics"

TITLE GUIDELINES (VERY IMPORTANT)

When generating "suggestedTitle":

Title MUST be short, human-friendly, and reflect the note’s main idea

Use promptText + responseText to understand context

Title MUST NOT be:

a direct copy of user text

purely conversational

meta (like "turn 3", "you wrote", "this revised version", "as discussed above", etc.)

Prefer descriptive, declarative titles (about 5–12 words)

Forbidden patterns (do NOT use them under any circumstances):

Do NOT include the word "Turn" anywhere in the title

Do NOT include parentheses like "(Turn 3)" or similar meta suffixes

Do NOT copy the fileName, chatTitle, subjectHint, or topicHint verbatim into the title.

You may reuse individual words (e.g., "cheese", "heart health"), but the title MUST NOT just be those strings with minor tweaks.

For chats with multiple turns in the same file (fileName shared across notes):

Titles for these notes MUST be distinct

Differentiate titles by focusing on the unique content of each turn

Examples:

Bad: "I just finished a 90 minute cycling session"
Good: "Refueling After a 90-Minute Moderate Cycling Session"

Bad: "Let's assume that I want to eat pasta"
Good: "Small Pasta Portions Around Low-Intensity Exercise"

Cheese example (for a chat about heart-healthy cheeses):

Good titles:

"Criteria for Heart-Healthier Cheese Choices"

"Nutrition Comparison Table for Nine Common Cheeses"

"Is Cheddar Worse Than Brie for Heart Health?"

"Ranking Cheeses from Best to Worst for CAD"

"Heart-Health Assessment of Burrata Cheese"

"Updated Cheese Ranking Including Burrata and Gouda"

Bad titles (NOT allowed):

"Heart Health Ranking Best Worst (Turn 1)"

"Healthy Cheeses For Heart (Turn 2)"

Any title that just adds "(Turn N)" or copies a file name like "heart-health-ranking-best-worst-202511160650".

TRANSFORMATION RULES

Read input "notes"

Infer a reusable hierarchy of subjects & topics

Build "subjects"

Build "topics" (each with subjectId)

Optionally build "topicRelations"

For EACH input note:

Copy aiNoteKey

Copy chatworthyNoteId

Copy fileName

Assign subjectId

Assign topicId

Generate "suggestedTitle" following the TITLE GUIDELINES

Ensure output "notes" length matches input "notes" length

If near limits, you MAY shorten titles or names — but you MUST NOT:

Omit notes

Omit aiNoteKey

Change the required structure

VALIDATION BEFORE YOU RESPOND

Before sending your final JSON:

Confirm top-level structure:
version, subjects, topics, topicRelations, notes

Confirm "version" is 1

Confirm:

"subjects" use only { "id", "name" }

"topics" use only { "id", "subjectId", "name" }

"topicRelations" use only { "sourceTopicId", "targetTopicId", "kind" }

"notes" use only { "aiNoteKey", "chatworthyNoteId", "fileName", "subjectId", "topicId", "suggestedTitle" }

Confirm:

Output "notes" length matches input "notes" length

Each aiNoteKey appears exactly once in output "notes"

All used subjectId and topicId exist in "subjects" / "topics"

Finally, write this single JSON object into a file named ai-classification-v1.json and return it to me as a downloadable file. Do NOT print the JSON inline unless you absolutely cannot return a file.
