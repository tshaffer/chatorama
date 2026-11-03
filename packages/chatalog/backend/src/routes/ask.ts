// Ask Claude across all notes (the top bar's Ask). Claude searches the notes
// itself; answers can be saved as notes, turned into changes to notes in any
// topic, and the conversation is saved so it can be continued later.
import { Router } from 'express';
import { saveAskAllAnswer, streamAskAll } from '../controllers/askAllController';
import {
  applyNoteChangesAcrossTopics,
  proposeNoteChangesAcrossTopics,
  undoNoteChangeSet,
} from '../controllers/noteChangesController';
import {
  appendAskConversationTurn,
  createAskConversation,
  deleteAskConversation,
  getAskConversation,
  listAskConversations,
  updateAskConversation,
} from '../controllers/askConversationsController';

const askRouter = Router();

askRouter.post('/stream', streamAskAll);
askRouter.post('/save', saveAskAllAnswer);
askRouter.post('/plan', proposeNoteChangesAcrossTopics);
askRouter.post('/note-changes/apply', applyNoteChangesAcrossTopics);
askRouter.post('/note-changes/:changeSetId/undo', undoNoteChangeSet);

askRouter.get('/conversations', listAskConversations);
askRouter.post('/conversations', createAskConversation);
askRouter.get('/conversations/:conversationId', getAskConversation);
askRouter.patch('/conversations/:conversationId', updateAskConversation);
askRouter.delete('/conversations/:conversationId', deleteAskConversation);
askRouter.post('/conversations/:conversationId/turns', appendAskConversationTurn);

export default askRouter;
