#!/usr/bin/env node
/**
 * Extract ChatGPT conversation URLs from a ChatGPT export conversations.json.
 *
 * Usage:
 *   node extract-chat-urls.mjs /path/to/conversations.json > archived_chat_urls.txt
 *   node scripts/extract-chat-urls.mjs /Users/tedshaffer/Documents/ChatGPTExports/ChatGPTFullDataExport-12-24-2025/conversations.json > /Users/tedshaffer/Documents/ChatGPTExports/archived_chat_urls.txt
 *
 * Notes:
 * - Export JSON schema varies over time. This script searches broadly.
 * - If it can detect an "archived" boolean, it will prefer archived-only.
 * - Otherwise it outputs all conversation IDs it finds; the unarchiver will skip non-archived ones.
 */

import fs from "fs";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node extract-chat-urls.mjs /path/to/conversations.json > archived_chat_urls.txt");
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error("Failed to parse JSON:", e.message);
  process.exit(1);
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function getCandidateId(obj) {
  // Common ID field names seen across exports
  const candidates = ["id", "conversation_id", "conversationId", "chatId", "uuid"];
  for (const k of candidates) {
    if (typeof obj[k] === "string" && obj[k].length >= 10) return obj[k];
  }
  return null;
}

function getArchivedFlag(obj) {
  // Try common archived flags (schema varies)
  const candidates = ["is_archived", "archived", "isArchived", "is_archive", "isArchive"];
  for (const k of candidates) {
    if (typeof obj[k] === "boolean") return obj[k];
  }
  return null; // unknown
}

function looksLikeConversation(obj) {
  // Heuristics: has an id and some conversation-ish fields
  const id = getCandidateId(obj);
  if (!id) return false;

  // If it has messages/mapping/title/create_time etc, it’s probably a conversation node
  const likelyKeys = ["title", "mapping", "messages", "create_time", "update_time", "current_node"];
  let score = 0;
  for (const k of likelyKeys) if (k in obj) score++;
  return score >= 1;
}

const found = new Map(); // id -> { archived: boolean|null }

function walk(node) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }
  if (!isObject(node)) return;

  if (looksLikeConversation(node)) {
    const id = getCandidateId(node);
    const archived = getArchivedFlag(node);
    if (!found.has(id)) found.set(id, { archived });
    else {
      // keep "true" if any instance says true
      const prev = found.get(id);
      const merged = {
        archived:
          prev.archived === true || archived === true
            ? true
            : prev.archived === false && archived === false
              ? false
              : prev.archived ?? archived
      };
      found.set(id, merged);
    }
  }

  for (const v of Object.values(node)) walk(v);
}

walk(data);

// Decide whether we have *any* reliable archived flags at all
const hasAnyArchivedFlags = Array.from(found.values()).some(v => typeof v.archived === "boolean");

const ids = Array.from(found.entries())
  .filter(([_, meta]) => {
    if (!hasAnyArchivedFlags) return true;      // can’t filter; output all
    return meta.archived === true;              // filter to archived only
  })
  .map(([id]) => id)
  .sort();

for (const id of ids) {
  // ChatGPT has used /c/<id> for a long time; this is the current canonical format.
  console.log(`https://chatgpt.com/c/${id}`);
}
