import { NoteModel } from '../models/Note';
import { embedText } from '../ai/embed';
import { buildNoteEmbeddingInput, hashEmbeddingText } from '../ai/embeddingText';
import { buildRecipeSemanticText } from './buildRecipeSemanticText';

type EmbedOptions = {
  force?: boolean;
};

const MIN_TEXT_LEN = 10;

function isNonEmptyVector(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export async function computeAndPersistEmbeddings(
  noteId: string,
  opts: EmbedOptions = {},
): Promise<void> {
  const note = await NoteModel.findById(noteId).lean().exec();
  if (!note) return;

  if (note.docKind === 'recipe') {
    await computeAndPersistRecipeEmbedding(note, opts);
  } else {
    await computeAndPersistNoteEmbedding(note, opts);
  }
}

async function computeAndPersistNoteEmbedding(note: any, opts: EmbedOptions) {
  const { text, hash } = buildNoteEmbeddingInput(note, {
    includeMarkdown: true,
    includeSummary: true,
    includeTags: true,
    includeRecipe: false,
  });

  if (!text || text.length < MIN_TEXT_LEN) return;

  const hasEmbedding = isNonEmptyVector(note.embedding);
  const hashMatches = note.embeddingTextHash === hash;
  if (!opts.force && hasEmbedding && hashMatches) return;

  const { vector, model } = await embedText(text, { model: 'text-embedding-3-small' });

  await NoteModel.updateOne(
    { _id: note._id },
    {
      $set: {
        embedding: vector,
        embeddingModel: model,
        embeddingTextHash: hash,
        embeddingUpdatedAt: new Date(),
      },
    },
  ).exec();
}

async function computeAndPersistRecipeEmbedding(note: any, opts: EmbedOptions) {
  const text = buildRecipeSemanticText(note);
  if (!text || text.length < MIN_TEXT_LEN) return;

  const hash = hashEmbeddingText(text);
  const hasEmbedding = isNonEmptyVector(note.recipeEmbedding);
  const hashMatches = note.recipeEmbeddingTextHash === hash;
  if (!opts.force && hasEmbedding && hashMatches) return;

  const { vector, model } = await embedText(text, { model: 'text-embedding-3-small' });

  await NoteModel.updateOne(
    { _id: note._id },
    {
      $set: {
        recipeEmbedding: vector,
        recipeEmbeddingModel: model,
        recipeEmbeddingTextHash: hash,
        recipeEmbeddingUpdatedAt: new Date(),
      },
    },
  ).exec();
}
