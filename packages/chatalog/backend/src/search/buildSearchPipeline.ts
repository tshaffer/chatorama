import type { PipelineStage } from 'mongoose';
import type { SearchSpec } from '@chatorama/chatalog-shared';
import { buildNoteFilterFromSpec, isNonEmptyFilter } from '../utils/search/noteFilters';

type BuildSearchPipelineOptions = {
  vectorStage?: Record<string, any>;
  ingredientFilter?: Record<string, any>;
  includeMarkdown?: boolean;
};

export function buildSearchPipeline(
  spec: SearchSpec,
  opts: BuildSearchPipelineOptions = {}
): PipelineStage[] {
  const { vectorStage, ingredientFilter, includeMarkdown } = opts;
  const { atlasFilter, postFilter, combinedFilter } = buildNoteFilterFromSpec(
    spec,
    ingredientFilter
  );

  if (vectorStage) {
    const stage = { ...vectorStage };
    if (isNonEmptyFilter(atlasFilter)) {
      stage.filter = atlasFilter;
    }

    const pipeline: any[] = [
      { $vectorSearch: stage },
      ...(isNonEmptyFilter(postFilter) ? [{ $match: postFilter }] : []),
      {
        $project: {
          _id: 1,
          title: 1,
          summary: 1,
          subjectId: 1,
          topicId: 1,
          updatedAt: 1,
          score: { $meta: 'vectorSearchScore' },
          hasRecipe: { $ne: [{ $ifNull: ['$recipe', null] }, null] },
          docKind: 1,
        },
      },
      { $sort: { score: -1 } },
      ...(spec.limit ? [{ $limit: spec.limit }] : []),
    ];

    return pipeline as PipelineStage[];
  }

  const matchStage: PipelineStage.Match = {
    $match: {
      $text: { $search: spec.query },
      ...(isNonEmptyFilter(combinedFilter) ? combinedFilter : {}),
    },
  };

  const project: PipelineStage.Project = {
    $project: {
      _id: 1,
      title: 1,
      summary: 1,
      subjectId: 1,
      topicId: 1,
      updatedAt: 1,
      score: { $meta: 'textScore' },
      docKind: 1,
      ...(includeMarkdown ? { markdown: 1 } : {}),
    },
  };

  const pipeline: any[] = [
    matchStage,
    project,
    { $sort: { score: { $meta: 'textScore' } } },
    ...(spec.limit ? [{ $limit: spec.limit }] : []),
  ];

  return pipeline as PipelineStage[];
}
