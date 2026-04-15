import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CandidateItem,
  CandidateItemDuplicateMatch,
  CandidateItemGenerationBatch,
  CandidateItemIntakeMetadata,
} from '@disc-foundation/domain';
import type { CandidateItemRepository } from '../ports/repositories.js';
import { importCandidateItemGenerationBatch } from './candidate-item.js';

const assessmentDefinitionId = '00000000-0000-0000-0000-000000000111';

function assertIsRecord(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  assert.equal(typeof value, 'object', message);
  assert.notEqual(value, null, message);
}

function assertIsString(value: unknown, message: string): asserts value is string {
  assert.equal(typeof value, 'string', message);
}

function assertIsNumber(value: unknown, message: string): asserts value is number {
  assert.equal(typeof value, 'number', message);
}

function assertIsBoolean(value: unknown, message: string): asserts value is boolean {
  assert.equal(typeof value, 'boolean', message);
}

function assertIsDuplicateSource(
  value: unknown,
): asserts value is CandidateItemDuplicateMatch['source'] {
  assert.ok(value === 'candidate_item' || value === 'promoted_question');
}

const toCandidateItemIntakeMetadata = (
  value: CandidateItemIntakeMetadata,
): CandidateItemIntakeMetadata => {
  const normalizationVersion = value.normalizationVersion;
  const duplicateScreeningVersion = value.duplicateScreeningVersion;
  const likelyDuplicate = value.likelyDuplicate;
  const obviousDuplicate = value.obviousDuplicate;
  const duplicateMatchesRaw = value.duplicateMatches;

  assertIsString(normalizationVersion, 'Expected normalizationVersion to be a string');
  assertIsString(duplicateScreeningVersion, 'Expected duplicateScreeningVersion to be a string');
  assertIsBoolean(likelyDuplicate, 'Expected likelyDuplicate to be a boolean');
  assertIsBoolean(obviousDuplicate, 'Expected obviousDuplicate to be a boolean');
  assert.ok(Array.isArray(duplicateMatchesRaw), 'Expected duplicateMatches to be an array');

  const duplicateMatches: CandidateItemDuplicateMatch[] = duplicateMatchesRaw.map((entry) => {
    assertIsRecord(entry, 'Expected duplicate match entry to be an object');
    const match = entry;
    const source = match.source;
    const sourceId = match.sourceId;
    const sourcePrompt = match.sourcePrompt;
    const similarityScore = match.similarityScore;
    const duplicate = match.obviousDuplicate;
    assertIsDuplicateSource(source);
    assertIsString(sourceId, 'Expected sourceId to be a string');
    assertIsString(sourcePrompt, 'Expected sourcePrompt to be a string');
    assertIsNumber(similarityScore, 'Expected similarityScore to be a number');
    assertIsBoolean(duplicate, 'Expected obviousDuplicate to be a boolean');
    return {
      source,
      sourceId,
      sourcePrompt,
      similarityScore,
      obviousDuplicate: duplicate,
    };
  });

  return {
    normalizationVersion,
    duplicateScreeningVersion,
    likelyDuplicate,
    obviousDuplicate,
    duplicateMatches,
  };
};

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
        adaptiveEligible: input.adaptiveEligible ?? false,
        itemPoolGroupIds: input.itemPoolGroupIds ?? [],
        routingTags: input.routingTags ?? [],
        uncertaintyTargetAreas: input.uncertaintyTargetAreas ?? [],
        ...(input.calibration ? { calibration: input.calibration } : {}),
        aiMetadata: {
          aiGenerated: input.aiGenerated,
          ...(input.aiModel ? { aiModel: input.aiModel } : {}),
          ...(input.aiPromptVersion ? { aiPromptVersion: input.aiPromptVersion } : {}),
        },
        ...(input.generationBatchId ? { generationBatchId: input.generationBatchId } : {}),
        ...(input.intakeMetadata
          ? { intakeMetadata: toCandidateItemIntakeMetadata(input.intakeMetadata) }
          : {}),
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
