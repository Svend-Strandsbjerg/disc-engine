import assert from 'node:assert/strict';
import test from 'node:test';
import type { CandidateItem, CandidateItemGenerationBatch } from '@disc-foundation/domain';
import type { CandidateItemRepository } from '../ports/repositories.js';
import { importCandidateItemGenerationBatch } from './candidate-item.js';

const assessmentDefinitionId = '00000000-0000-0000-0000-000000000111';

const createRepositoryMock = (): CandidateItemRepository => {
  const createdItems: CandidateItem[] = [];

  return {
    createCandidateItem: async (input) => {
      const created: CandidateItem = {
        id: `00000000-0000-0000-0000-00000000${(200 + createdItems.length).toString().padStart(4, '0')}`,
        assessmentDefinitionId: input.assessmentDefinitionId,
        prompt: input.prompt,
        axis: input.axis,
        axisDirection: input.axisDirection,
        weight: input.weight,
        reverseKeyed: input.reverseKeyed,
        role: input.role,
        contextApplicability: input.contextApplicability,
        disambiguationTags: input.disambiguationTags ?? [],
        aiMetadata: {
          aiGenerated: input.aiGenerated,
          ...(input.aiModel ? { aiModel: input.aiModel } : {}),
          ...(input.aiPromptVersion ? { aiPromptVersion: input.aiPromptVersion } : {}),
        },
        ...(input.generationBatchId ? { generationBatchId: input.generationBatchId } : {}),
        ...(input.intakeMetadata ? { intakeMetadata: input.intakeMetadata as CandidateItem['intakeMetadata'] } : {}),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      createdItems.push(created);
      return created;
    },
    createGenerationBatch: async (input) => {
      const created: CandidateItemGenerationBatch = {
        id: '00000000-0000-0000-0000-000000000500',
        generationId: input.generationId,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        sourceType: input.sourceType,
        modelName: input.modelName,
        promptVersion: input.promptVersion,
        targetAssessmentDefinitionId: input.targetAssessmentDefinitionId,
        ...(input.context ? { context: input.context } : {}),
        ...(input.rationaleNotes ? { rationaleNotes: input.rationaleNotes } : {}),
        normalizationVersion: input.normalizationVersion,
      };
      return created;
    },
    getDuplicateScreeningCorpus: async () => ({
      candidateItems: [{ id: '00000000-0000-0000-0000-000000000700', prompt: 'I enjoy fast paced work.' }],
      promotedQuestions: [],
    }),
    listCandidateItems: async () => [],
    createCandidateItemReview: async () => {
      throw new Error('not implemented');
    },
    getLatestCandidateItemReview: async () => null,
    findSimilarItems: async () => [],
    promoteApprovedCandidates: async () => [],
  };
};

test('imports generation batch and flags likely duplicates while storing candidate items', async () => {
  const repository = createRepositoryMock();

  const result = await importCandidateItemGenerationBatch(
    { candidateItemRepository: repository },
    {
      generationId: 'gen-001',
      sourceType: 'ai_assistant',
      modelName: 'gpt-test',
      promptVersion: 'v3.1',
      targetAssessmentDefinitionId: assessmentDefinitionId,
      items: [
        {
          prompt: 'I enjoy fast paced work settings.',
          axis: 'tempo',
          axisDirection: 'highTempo',
          weight: 1,
          reverseKeyed: false,
          role: 'core',
          contextApplicability: ['work'],
          disambiguationTags: ['speed'],
          aiGenerated: true,
          aiModel: 'gpt-test',
          aiPromptVersion: 'v3.1',
        },
      ],
    },
  );

  assert.equal(result.totalItems, 1);
  assert.equal(result.importedItems, 1);
  assert.equal(result.rejectedObviousDuplicates, 0);
  assert.equal(result.results[0]?.likelyDuplicate, true);
  assert.equal(result.results[0]?.obviousDuplicate, false);
});

test('rejects obviously identical duplicate prompts during import', async () => {
  const repository = createRepositoryMock();

  const result = await importCandidateItemGenerationBatch(
    { candidateItemRepository: repository },
    {
      generationId: 'gen-002',
      sourceType: 'ai_assistant',
      modelName: 'gpt-test',
      promptVersion: 'v3.1',
      targetAssessmentDefinitionId: assessmentDefinitionId,
      items: [
        {
          prompt: 'I enjoy fast paced work.',
          axis: 'tempo',
          axisDirection: 'highTempo',
          weight: 1,
          reverseKeyed: false,
          role: 'core',
          contextApplicability: ['work'],
          aiGenerated: true,
          aiModel: 'gpt-test',
          aiPromptVersion: 'v3.1',
        },
      ],
    },
  );

  assert.equal(result.totalItems, 1);
  assert.equal(result.importedItems, 0);
  assert.equal(result.rejectedObviousDuplicates, 1);
  assert.equal(result.results[0]?.status, 'rejected_obvious_duplicate');
});
