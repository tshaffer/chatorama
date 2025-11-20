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

You MUST generate a SINGLE JSON OBJECT ONLY — no explanation, no Markdown code fences, no commentary before or after. The JSON MUST have exactly these top-level properties:

{
"version": 1,
"subjects": [ ... ],
"topics": [ ... ],
"topicRelations": [ ... ],
"notes": [ ... ]
}

Because the JSON will be large, you MUST NOT print it directly in the chat. Instead, create a JSON file named ai-classification-v1.json containing that single JSON object, and return it to me as a downloadable file attachment. If for some reason you cannot create a downloadable file, then and only then print the JSON inline.

1. SUBJECTS FORMAT

The "subjects" array MUST contain objects of this shape:

{
"id": "S-<slug>",
"name": "<Human-readable subject name>"
}

Constraints:

"id" is a machine-friendly string, starting with "S-" and then a short kebab-case slug, e.g. "S-personal-health-nutrition".

"name" is a human-friendly label, e.g. "Personal Health & Nutrition".

Do NOT include any other fields.

Reuse subjects across notes where it makes sense; do NOT create one subject per note unless absolutely necessary.

When possible, infer subjects from subjectHint, topicHint, chatTitle, promptText, and responseText.

2. TOPICS FORMAT

The "topics" array MUST contain objects of this shape:

{
"id": "T-<slug>",
"subjectId": "<one of the subject ids above>",
"name": "<Human-readable topic name>"
}

Constraints:

"id" is a machine-friendly string, starting with "T-" and then a short kebab-case slug, e.g. "T-on-ride-fuel-bars-vs-fruit".

"subjectId" MUST be the id of an existing subject defined in "subjects".

"name" is a human-friendly label for the topic.

Do NOT include any other fields.

Reuse topics across multiple notes when appropriate. Don’t create redundant topics with different ids but similar names.

When possible, infer topics from topicHint, subjectHint, chatTitle, promptText, and responseText.

3. TOPIC RELATIONS FORMAT

The "topicRelations" array is OPTIONAL but recommended. It MUST contain objects of this shape:

{
"sourceTopicId": "<topic id>",
"targetTopicId": "<topic id>",
"kind": "<relation kind>"
}

Constraints:

"sourceTopicId" and "targetTopicId" MUST be valid ids from the "topics" array.

"kind" is a short relation label such as "see-also", "also-about", or "supports".

Do NOT include any other fields.

If you have no relations to propose, return an empty array: "topicRelations": [].

4. NOTES FORMAT (CRITICAL)

The "notes" array in your OUTPUT is where you map each input note to a subject/topic and suggested title.

The OUTPUT "notes" array MUST:

Have the SAME LENGTH as the input notes array.

Include EVERY aiNoteKey from the input.

Contain EXACTLY ONE output entry per input note.

Never merge, drop, or sample notes.

Each output note MUST have this exact shape:

{
"aiNoteKey": "<copied from input note>",
"chatworthyNoteId": "<copied from input note>",
"fileName": "<copied from input note>",
"subjectId": "<id of subject from subjects[]>",
"topicId": "<id of topic from topics[]>",
"suggestedTitle": "<short human-friendly title for this note>"
}

Constraints:

"aiNoteKey" MUST exactly match the "aiNoteKey" of the input note.

"chatworthyNoteId" MUST be copied from the corresponding field in the input note.

"fileName" MUST be copied from the corresponding field in the input note.

"subjectId" MUST be one of the "id" values in the "subjects" array.

"topicId" MUST be one of the "id" values in the "topics" array.

5. TITLE GUIDELINES (VERY IMPORTANT)

When generating "suggestedTitle" for each note:

The title MUST be a short, human-friendly summary of the main idea of the note, like a heading in a personal knowledge base.

You MUST use the content of the note (promptText + responseText) to understand the main idea.

The title MUST NOT be a direct copy or simple truncated slice of the user’s prompt or of any single sentence of the note.

Prefer declarative / descriptive titles, e.g.

"Pasta Timing Around Moderate Exercise for Blood Sugar Control"
instead of

"I just finished a 90 minute cycling session"

"Let's assume that I want to eat pasta".

Forbidden patterns (do NOT use them under any circumstances):

Do NOT include the word "Turn" anywhere in the title.

Do NOT include meta phrases like "turn 3", "(Turn 3)", "this revised version", "you wrote", "as discussed above", etc.

Do NOT copy the fileName, chatTitle, subjectHint, or topicHint verbatim into the title. You may reuse individual words (like “cheese”, “heart health”), but the title must not just be those strings with minor tweaks.

If multiple notes share the same fileName (i.e., multiple turns in one chat), the titles MUST be distinct and focus on what is unique about that turn. For example, in a cheese-related chat:

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

Any title that just adds "(Turn N)" or copies the file name like "heart-health-ranking-best-worst-202511160650".

Aim for about 5–12 words per title when possible.

6. TRANSFORMATION RULES

Read the input "notes" array.

Infer a clean, reusable hierarchy of subjects and topics that fits ALL notes, reusing subjects/topics where appropriate.

Build the "subjects" array (1..N subjects).

Build the "topics" array (each topic references a subjectId).

Optionally build "topicRelations" between related topics.

For EACH input note:

Copy "aiNoteKey" from the input note.

Copy "chatworthyNoteId" from the input note.

Copy "fileName" from the input note.

Assign "subjectId" to one of the subjects you defined.

Assign "topicId" to one of the topics you defined (which in turn references the chosen subject).

Generate a concise "suggestedTitle" following the TITLE GUIDELINES above.

Ensure the number of entries in the OUTPUT "notes" array is EXACTLY the same as the number of entries in the INPUT "notes" array.

If you are approaching any length or token limit, you MAY shorten:

"name" fields for subjects/topics.

"suggestedTitle" values.
But you MUST NOT:

Omit notes.

Omit aiNoteKey.

Change the required JSON structure.

7. VALIDATION BEFORE YOU RESPOND

Before you finalize the JSON object (to be written into ai-classification-v1.json):

Confirm that the top-level structure is exactly:

"version"

"subjects"

"topics"

"topicRelations"

"notes"

Confirm that "version" is the number 1.

Confirm that every object in "subjects" uses only { "id", "name" }.

Confirm that every object in "topics" uses only { "id", "subjectId", "name" }.

Confirm that every object in "topicRelations" uses only { "sourceTopicId", "targetTopicId", "kind" }.

Confirm that every object in "notes" uses only:
{ "aiNoteKey", "chatworthyNoteId", "fileName", "subjectId", "topicId", "suggestedTitle" }.

Confirm that:

The output "notes" array length is exactly the same as the input "notes" array length.

Every aiNoteKey from the input appears exactly once in the output "notes".

Every subjectId / topicId used in "notes" exists in "subjects" / "topics".

Finally, write this single JSON object into a file named ai-classification-v1.json and return it to me as a downloadable file. Do NOT print the JSON inline unless you absolutely cannot return a file.
