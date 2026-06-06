// Shared types used by both server (sessionReader) and client (app.tsx)

export interface SessionInfo {
  sessionId: string;
  title: string;       // derived from first user message
  date: string;        // YYYY-MM-DD from file mtime
  projectSlug: string; // raw slug from ~/.claude/projects/
  filePath: string;
}

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface UserPrompt {
  turnIndex: number;  // index into the turns array
  preview: string;    // first 80 chars, newlines replaced with spaces
}

export interface SessionData {
  session: SessionInfo;
  turns: Turn[];
  userPrompts: UserPrompt[];
}

// WebSocket message shapes
export type ServerMessage = { type: 'refresh' };
