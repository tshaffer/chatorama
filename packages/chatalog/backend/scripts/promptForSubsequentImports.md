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

You also have a second attached file (e.g. ai-hierarchy-for-ai-v2.json) that contains an existing set of Subjects and Topics.
You must reuse these Subjects and Topics whenever possible and only propose new ones when absolutely necessary.

Your task is to classify each note into a Subject and Topic and propose a short, human-friendly title.

You MUST return a single JSON object only — no explanation, no Markdown code fences, no headings, no commentary, and no extra fields.

The JSON MUST have exactly these top-level properties:

{
  "version": 2,
  "generatedAt": "<ISO date string>",
  "subjects": [ ... ],
  "topics": [ ... ],
  "notes": [ ... ]
}


Because the JSON may be large, you MUST NOT print it inline.
You MUST create a file named (for example) ai-classification-batch-2.json containing this single JSON object and return it as a downloadable attachment.
If you cannot return a file, then and only then print the JSON inline.

HIERARCHY STRATEGY (CRUCIAL)

Your primary goal is to build a compact subject hierarchy with richer topics, not one subject per note.

Global rules:

Prefer FEW subjects, MANY topics.

It is NORMAL and DESIRABLE to have many topics under one subject.

It is UNDESIRABLE to create many narrow subjects that duplicate their topics.

Subjects = broad domains (e.g., “Personal Health & Nutrition”, “Travel Planning”, “Software Development”, “Photography Workflow”).
A subject should comfortably contain many distinct conversations over time.

Topics = specific themes within a subject.

Examples inside “Personal Health & Nutrition”:

On-ride fueling

Protein needs for older adults

Cheese and heart health

Post-ride recovery meals

Yogurt choices and heart health

If many notes share the same general domain, they SHOULD share one subject.

DO NOT create subject-per-note.
DO NOT create separate subjects for yogurt vs cheese vs fruit vs eggs if they all belong under “Personal Health & Nutrition”.
These MUST be topics, not subjects.

Only create a new subject when the domain is clearly different (health vs travel vs coding vs photography).

If you are unsure whether something should be a new subject or topic, choose “new topic under an existing subject.”

SUBJECTS FORMAT (Incremental Mode)

The "subjects" array MUST contain only the new subjects you are proposing.
If you are not creating any new subjects:

"subjects": []


Each subject MUST follow:

{
  "name": "<Human-readable subject name>"
}


Constraints:

Use human-friendly names.

Do NOT include IDs here (v2 assigns IDs elsewhere).

Reuse existing subjects by name whenever possible.

Only propose a new subject when truly necessary.

Do NOT include any additional fields.

TOPICS FORMAT (Incremental Mode)

The "topics" array MUST contain only the new topics you are proposing.
If no new topics are needed:

"topics": []


Each topic MUST follow:

{
  "subjectName": "<existing or newly-proposed subject name>",
  "name": "<Human-readable topic name>"
}


Constraints:

subjectName MUST refer to an existing subject or one listed in "subjects".

Topic names MUST be human-friendly.

Reuse existing topics whenever possible.

Avoid near-duplicate topics.

Do NOT include other fields.

NOTES FORMAT (CRITICAL)

The "notes" array MUST:

Have the SAME LENGTH as the input notes array.

Include EVERY aiNoteKey.

Produce EXACTLY ONE output entry per input note.

Never merge, drop, or sample notes.

Each output note MUST follow:

{
  "aiNoteKey": "<copied from input>",
  "subjectName": "<subject name>",
  "topicName": "<topic name>",
  "suggestedTitle": "<short human-friendly title>"
}


Constraints:

aiNoteKey MUST match the input exactly.

subjectName MUST be from the existing hierarchy or your "subjects" array.

topicName MUST be from the existing hierarchy or your "topics" array.

TITLE GUIDELINES (VERY IMPORTANT)

For each "suggestedTitle":

Short, human-friendly, clear.

5–12 words preferred.

Base it on the full content (prompt + response).

Titles MUST NOT be conversational or copied from the prompt.

MUST NOT contain “Turn” or parentheses like “(Turn 3)”.

MUST NOT copy fileName, chatTitle, subjectHint, or topicHint verbatim.

MUST be distinct for notes sharing the same fileName.

Good:

“Criteria for Heart-Healthier Cheese Choices”

“Daily Protein Needs for an Active Older Cyclist”

“Refueling After a 90-Minute Moderate Ride”

Bad:

“I just finished a 90 minute cycling session”

“Let’s assume I want pasta”

“Heart Health Ranking Best Worst (Turn 1)”

VALIDATION BEFORE YOU RESPOND

Before returning your final JSON file, confirm:

Top-level structure exactly matches:
version, generatedAt, subjects, topics, notes

version is 2.

"subjects" only contains { "name": "..." }.

"topics" only contains { "subjectName": "...", "name": "..." }.

"notes" only contains exactly:
{ "aiNoteKey", "subjectName", "topicName", "suggestedTitle" }

Output "notes" length matches input "notes" length.

Each input aiNoteKey appears exactly once.

Finally, write the single JSON object into a file (named ai-classification-v2.json) and return it as a downloadable attachment.
Do NOT print the JSON inline unless you absolutely cannot return a file.
