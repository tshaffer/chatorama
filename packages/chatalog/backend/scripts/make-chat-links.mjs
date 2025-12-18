#!/usr/bin/env node
/**
 * Generate an HTML page of clickable ChatGPT conversation URLs from an OpenAI export conversations.json.
 *
 * Usage:
 *   node make-chat-links.mjs /path/to/conversations.json /path/to/out.html
 *   node scripts/make-chat-links.mjs /Users/tedshaffer/Documents/ChatGPTExports/ChatGPTFullDataExport-12-20-2025/conversations.json /Users/tedshaffer/Documents/ChatGPTExports/out.html
 *
 * Notes:
 * - Works with typical export shapes:
 *   - an array of conversations
 *   - or an object containing { conversations: [...] } or { data: [...] }
 * - Builds canonical URLs: https://chatgpt.com/c/<id>
 * - Includes title + created time when available
 */

import fs from "node:fs";
import path from "node:path";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function toArray(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.conversations)) return json.conversations;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.items)) return json.items;
  return null;
}

function pickId(obj) {
  return obj?.id ?? obj?.conversation_id ?? obj?.conversationId ?? obj?.uuid ?? null;
}

function pickTitle(obj) {
  return obj?.title ?? obj?.name ?? obj?.conversation_title ?? obj?.conversationTitle ?? "(untitled)";
}

function pickCreated(obj) {
  // Exports vary: created_time often in seconds; createdAt may be ISO; sometimes create_time
  const t =
    obj?.created_time ??
    obj?.create_time ??
    obj?.createdAt ??
    obj?.created_at ??
    obj?.createTime ??
    null;

  if (!t) return null;

  // If ISO-ish string
  if (typeof t === "string") {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  }

  // If numeric seconds or ms
  if (typeof t === "number") {
    // Heuristic: seconds are ~1e9, ms are ~1e12
    const ms = t < 2e10 ? t * 1000 : t;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDate(d) {
  // Local-friendly, readable
  return d.toLocaleString();
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? path.resolve(process.cwd(), "chatgpt-links.html");

if (!inputPath) {
  die("Usage: node make-chat-links.mjs /path/to/conversations.json [/path/to/out.html]");
}

let raw;
try {
  raw = fs.readFileSync(inputPath, "utf8");
} catch (e) {
  die(`Failed to read file: ${inputPath}\n${e.message}`);
}

let json;
try {
  json = JSON.parse(raw);
} catch (e) {
  die(`Failed to parse JSON: ${inputPath}\n${e.message}`);
}

const conversations = toArray(json);
if (!conversations) {
  die(
    "Could not find an array of conversations. Expected JSON to be an array, or have a conversations/data/items array."
  );
}

const rows = [];
for (const c of conversations) {
  const id = pickId(c);
  if (!id) continue;

  const title = pickTitle(c);
  const created = pickCreated(c);
  const url = `https://chatgpt.com/c/${encodeURIComponent(id)}`;

  rows.push({
    id,
    title,
    created,
    url,
  });
}

// Sort newest first when we have created date; otherwise keep stable order
rows.sort((a, b) => {
  const at = a.created?.getTime?.() ?? -Infinity;
  const bt = b.created?.getTime?.() ?? -Infinity;
  return bt - at;
});

// ---- Build a stable-ish report id so localStorage persists per export file ----
function fileStatId(p) {
  try {
    const st = fs.statSync(p);
    return `${path.resolve(p)}|${st.size}|${st.mtimeMs}`;
  } catch {
    return `${path.resolve(p)}|nostat`;
  }
}
const reportId = `chatgpt_export_links:${fileStatId(inputPath)}`;
const safeJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

// Build items for the UI (keep minimal but complete)
const items = rows.map((r) => ({
  id: r.id,
  title: r.title,
  created: r.created ? r.created.toISOString() : null,
  createdLabel: r.created ? fmtDate(r.created) : "",
  url: r.url,
}));

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ChatGPT Export Links</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 24px; }
    h1 { margin: 0 0 10px 0; font-size: 20px; }
    .meta { color: #555; margin: 0 0 12px 0; font-size: 13px; }
    .bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 12px 0 16px; }
    button { padding: 6px 10px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
    button:hover { background: #f6f6f6; }
    input[type="text"] { width: min(820px, 100%); padding: 10px 12px; font-size: 14px; }
    .muted { color: #666; font-size: 12px; }
    .pill { display:inline-block; padding:2px 8px; border:1px solid #ddd; border-radius:999px; font-size:12px; color:#444; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid #eee; padding: 10px 8px; vertical-align: top; }
    th { position: sticky; top: 0; background: white; z-index: 2; }
    a { color: #0b57d0; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .small { color: #666; font-size: 12px; }
    .id { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; color: #444; }
    tr.processed td { opacity: 0.55; }
    tr.processed a { text-decoration: line-through; }
    .hidden { display: none; }
    td.ctrl { text-align: center; white-space: nowrap; }
    input[type="radio"], input[type="checkbox"] { transform: scale(1.05); }
    .statusCol { min-width: 320px; }
    .statusGroup { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; }
    .statusGroup label { display:flex; align-items:center; gap:6px; font-size:12px; color:#333; }
    .right { margin-left: auto; }
  </style>
</head>
<body>
  <h1>ChatGPT Export Links</h1>
  <div class="meta">
    Generated from: <span class="id">${escapeHtml(path.resolve(inputPath))}</span><br/>
    Total conversations: <b>${items.length}</b><br/>
    LocalStorage key: <span class="id" id="storageKey"></span>
  </div>

  <div class="bar">
    <input id="filter" type="text" placeholder="Filter by title, id, or URL…" />

    <span class="right muted" id="counts"></span>
  </div>

  <div class="bar">
    <button id="btnMarkAll">Mark all processed</button>
    <button id="btnClearProcessed">Clear processed</button>

    <label style="display:flex;align-items:center;gap:6px;">
      <input type="checkbox" id="chkHideProcessed" /> Hide processed
    </label>

    <span class="muted">
      Tip: Click a link → if chat loads, use ⋯ → <b>Unarchive</b>, then mark status here.
    </span>
  </div>

  <table id="tbl">
    <thead>
      <tr>
        <th style="width: 90px;">Processed</th>
        <th class="statusCol">Status</th>
        <th style="width: 46%;">Title</th>
        <th style="width: 18%;">Created</th>
        <th style="width: 26%;">Link</th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>

<script>
  const REPORT_ID = ${safeJson(reportId)};
  const ITEMS = ${safeJson(items)};

  const PROCESSED_KEY = "chatgpt_processed:" + REPORT_ID;
  const STATUS_KEY    = "chatgpt_status:" + REPORT_ID;
  const HIDE_KEY      = "chatgpt_hideProcessed:" + REPORT_ID;

  document.getElementById("storageKey").textContent = PROCESSED_KEY;

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function saveJson(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
  function loadHide() {
    return localStorage.getItem(HIDE_KEY) === "1";
  }
  function saveHide(v) {
    localStorage.setItem(HIDE_KEY, v ? "1" : "0");
  }

  // State
  const processed = loadJson(PROCESSED_KEY, {}); // { [id]: true }
  const status    = loadJson(STATUS_KEY, {});    // { [id]: "unknown" | ... }

  const STATUS_OPTIONS = [
    { key: "inProject", label: "In project" },
    { key: "archived", label: "Archived" },
    { key: "notInProject", label: "Not in project" },
    { key: "deleted",  label: "Deleted" },
  ];

  const tbody = document.getElementById("rows");
  const filter = document.getElementById("filter");
  const chkHide = document.getElementById("chkHideProcessed");

  function itemMatchesFilter(item, q) {
    if (!q) return true;
    const hay = (item.title + " " + item.id + " " + item.url).toLowerCase();
    return hay.includes(q);
  }

  function renderCounts(visibleItems) {
    const total = visibleItems.length;
    const processedCount = visibleItems.filter(i => !!processed[i.id]).length;

    const byStatus = {};
    for (const opt of STATUS_OPTIONS) byStatus[opt.key] = 0;
    for (const i of visibleItems) {
      const s = status[i.id] || "unknown";
      byStatus[s] = (byStatus[s] || 0) + 1;
    }

    const parts = [
      "Visible: " + total,
      "Processed: " + processedCount + "/" + total,
      "Remaining: " + (total - processedCount),
      " | ",
      "Archived: " + byStatus["archived"],
      "In project: " + byStatus["inProject"],
      "Not in project: " + byStatus["notInProject"],
      "Deleted: " + byStatus["deleted"],
    ];
    document.getElementById("counts").textContent = parts.join("  ");
  }

  function render() {
    const q = (filter.value || "").trim().toLowerCase();
    const hideProcessed = chkHide.checked;

    tbody.innerHTML = "";

    const visibleItems = ITEMS.filter(i => itemMatchesFilter(i, q));
    renderCounts(visibleItems);

    for (const item of visibleItems) {
      const isProcessed = !!processed[item.id];
      const s = status[item.id] || "unknown";

      const tr = document.createElement("tr");
      if (isProcessed) tr.classList.add("processed");
      if (hideProcessed && isProcessed) tr.classList.add("hidden");

      // Processed checkbox
      const tdProc = document.createElement("td");
      tdProc.className = "ctrl";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isProcessed;
      cb.addEventListener("change", () => {
        if (cb.checked) processed[item.id] = true;
        else delete processed[item.id];
        saveJson(PROCESSED_KEY, processed);
        render();
      });
      tdProc.appendChild(cb);

      // Status radios
      const tdStatus = document.createElement("td");
      tdStatus.className = "statusCol";
      const grp = document.createElement("div");
      grp.className = "statusGroup";

      for (const opt of STATUS_OPTIONS) {
        const label = document.createElement("label");
        const r = document.createElement("input");
        r.type = "radio";
        r.name = "status:" + item.id;
        r.checked = (s === opt.key);
        r.addEventListener("change", () => {
          status[item.id] = opt.key;
          if (opt.key === "unknown") delete status[item.id];
          saveJson(STATUS_KEY, status);
          render();
        });
        label.appendChild(r);
        label.appendChild(document.createTextNode(opt.label));
        grp.appendChild(label);
      }
      tdStatus.appendChild(grp);

      // Title + id
      const tdTitle = document.createElement("td");
      const divTitle = document.createElement("div");
      divTitle.textContent = item.title || "(untitled)";
      const divId = document.createElement("div");
      divId.className = "small id";
      divId.textContent = item.id;
      tdTitle.appendChild(divTitle);
      tdTitle.appendChild(divId);

      // Created
      const tdCreated = document.createElement("td");
      tdCreated.textContent = item.createdLabel || "";

      // Link
      const tdLink = document.createElement("td");
      const a = document.createElement("a");
      a.href = item.url;
      a.textContent = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      tdLink.appendChild(a);

      tr.appendChild(tdProc);
      tr.appendChild(tdStatus);
      tr.appendChild(tdTitle);
      tr.appendChild(tdCreated);
      tr.appendChild(tdLink);

      tbody.appendChild(tr);
    }
  }

  // Init hide toggle (persist)
  chkHide.checked = loadHide();
  chkHide.addEventListener("change", () => { saveHide(chkHide.checked); render(); });

  filter.addEventListener("input", render);

  document.getElementById("btnMarkAll").addEventListener("click", () => {
    for (const item of ITEMS) processed[item.id] = true;
    saveJson(PROCESSED_KEY, processed);
    render();
  });

  document.getElementById("btnClearProcessed").addEventListener("click", () => {
    for (const item of ITEMS) delete processed[item.id];
    saveJson(PROCESSED_KEY, processed);
    render();
  });

  render();
</script>
</body>
</html>`;

try {
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`Wrote: ${outputPath}`);
} catch (e) {
  die(`Failed to write output: ${outputPath}\n${e.message}`);
}
