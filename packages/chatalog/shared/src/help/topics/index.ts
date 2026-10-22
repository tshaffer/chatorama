import type { HelpTopic } from '../types.js';
import { gettingStarted } from './gettingStarted.js';
import { notes } from './notes.js';
import { subjectsAndTopics } from './subjectsAndTopics.js';
import { quickNotes } from './quickNotes.js';
import { searching } from './searching.js';
import { importing } from './importing.js';
import { manageHierarchy } from './manageHierarchy.js';
import { relations } from './relations.js';

export const helpTopics: HelpTopic[] = [
  gettingStarted,
  subjectsAndTopics,
  notes,
  quickNotes,
  searching,
  importing,
  manageHierarchy,
  relations,
];

export const helpCategoryOrder: string[] = [
  'Basics',
  'Content',
  'Finding Things',
  'Getting Content In',
  'Organization',
];
