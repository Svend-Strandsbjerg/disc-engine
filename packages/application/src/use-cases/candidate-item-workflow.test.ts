import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AssessmentReadRepository,
  AssessmentWriteRepository,
  CandidateItemRepository,
} from '../ports/repositories.js';
import type {
  AssessmentVersion,
  CandidateItem,
  CandidateItemGenerationBatch,
  CandidateItemReview,
} from '@disc-foundation/domain';
import { runCandidateItemAuthoringWorkflow } from './candidate-item.js';

const assessmentDefinitionId = '00000000-0000-0000-0000-000000000111';
const sourceVersionId = '00000000-0000-0000-0000-000000000222';
const clonedVersionId = '00000000-0000-0000-0000-000000000333';

const sourceVersion: AssessmentVersion = {
  id: sourceVersionId,
  assessmentDefinitionId,
  versionNumber: 2,
  scoringVersion: 'disc-v2-standard-30',
  metadata: {
    assessmentVersionKey: 'disc-standard-30',
    tier: 'standard',
    intendedUse: 'Balanced DISC profile for routine coaching and team development.',
    expectedItemCount: 30,
    expectedCompletionTimeMinutes: 11,
    form: 'future_adaptive_ready',
    contextFrame: 'work',
    adaptive: {
      adaptiveEligible: true,
      itemPoolGroupIds: ['screening-core', 'expanded-coverage'],
      uncertaintyTargetAreas: ['secondary-dimension-separation'],
      routingTags: ['standard'],
    },
  },
  status: 'published',
  questionCount: 30,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  publishedAt: new Date('2026-01-02T00:00:00.000Z'),
  immutableAt: new Date('2026-01-02T00:00:00.000Z'),
  dimensions: [],
  questions: [],
  scoringRules: [],
};

test('runs the authoring workflow end-to-end and promotes approved candidates to a new draft clone', async () => {
  const createdItems: CandidateItem[] = [];
  const reviews: CandidateItemReview[] = [];

  const candidateItemRepository: CandidateItemRepository = {
    createCandidateItem: async (input) => {
      const created: CandidateItem = {
        id: `00000000-0000-0000-0000-0000000004${createdItems.length + 10}`,
        assessmentDefinitionId: input.assessmentDefinitionId,
        prompt: input.prompt,
        axis: input.axis,
        axisDirection: input.axisDirection,
        weight: input.weight,
        reverseKeyed: input.reverseKeyed,
        role: input.role,
        ...(input.mirrorCandidateItemId ? { mirrorCandidateItemId: input.mirrorCandidateItemId } : {}),
        contextApplicability: input.contextApplicability,
        disambiguationTags: input.disambiguationTags ?? [],
        ...(input.uncertaintyProfile ? { uncertaintyProfile: input.uncertaintyProfile } : {}),
        adaptiveEligible: input.adaptiveEligible ?? false,
        itemPoolGroupIds: input.itemPoolGroupIds ?? [],
        routingTags: input.routingTags ?? [],
        uncertaintyTargetAreas: input.uncertaintyTargetAreas ?? [],
        ...(input.calibration ? { calibration: input.calibration } : {}),
        aiMetadata: {
          aiGenerated: input.aiGenerated,
          ...(input.aiModel ? { aiModel: input.aiModel } : {}),
          ...(input.aiPromptVersion ? { aiPromptVersion: input.aiPromptVersion } : {}),
          ...(input.aiRationale ? { aiRationale: input.aiRationale } : {}),
          ...(input.aiConfidence !== undefined ? { aiConfidence: input.aiConfidence } : {}),
          aiSuggestedAlternatives: input.aiSuggestedAlternatives ?? [],
        },
        ...(input.generationBatchId ? { generationBatchId: input.generationBatchId } : {}),
        ...(input.intakeMetadata ? { intakeMetadata: input.intakeMetadata } : {}),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      createdItems.push(created);
      return created;
    },
    createGenerationBatch: async (input) => {
      const batch: CandidateItemGenerationBatch = {
        id: '00000000-0000-0000-0000-000000000700',
        generationId: input.generationId,
        sourceType: input.sourceType,
        modelName: input.modelName,
        promptVersion: input.promptVersion,
        targetAssessmentDefinitionId: input.targetAssessmentDefinitionId,
        ...(input.context ? { context: input.context } : {}),
        ...(input.rationaleNotes ? { rationaleNotes: input.rationaleNotes } : {}),
        normalizationVersion: input.normalizationVersion,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      };
      return batch;
    },
    getDuplicateScreeningCorpus: async () => ({
      candidateItems: [],
      promotedQuestions: [],
    }),
    listCandidateItems: async () => [],
    createCandidateItemReview: async (input) => {
      const created: CandidateItemReview = {
        id: `00000000-0000-0000-0000-0000000008${reviews.length + 10}`,
        candidateItemId: input.candidateItemId,
        clarityScore: input.clarityScore,
        ambiguityRisk: input.ambiguityRisk,
        doubleBarreledRisk: input.doubleBarreledRisk,
        socialDesirabilityRisk: input.socialDesirabilityRisk,
        discriminationPotential: input.discriminationPotential,
        mirrorUsefulness: input.mirrorUsefulness,
        overlapRisk: input.overlapRisk,
        ...(input.reviewerNotes ? { reviewerNotes: input.reviewerNotes } : {}),
        status: input.status,
        nearDuplicateQuestionIds: input.nearDuplicateQuestionIds ?? [],
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
      };
      reviews.push(created);
      return created;
    },
    getLatestCandidateItemReview: async () => null,
    findSimilarItems: async () => [],
    promoteApprovedCandidates: async (input) =>
      input.candidateItemIds.map((candidateItemId, index) => ({
        candidateItemId,
        questionId: `00000000-0000-0000-0000-0000000009${index + 10}`,
        questionCode: `Q_NEW_${index + 1}`,
      })),
  };

  const assessmentReadRepository: AssessmentReadRepository = {
    getVersion: async (versionId) => (versionId === sourceVersionId ? sourceVersion : null),
    getActivePublishedVersion: async () => null,
    listLatestPublishedVersionsByDefinitionKeys: async () => [],
  };

  const assessmentWriteRepository: AssessmentWriteRepository = {
    createAssessmentDefinition: async () => {
      throw new Error('not implemented');
    },
    createAssessmentVersionDraft: async () => {
      throw new Error('not implemented');
    },
    cloneAssessmentVersion: async (input) => ({
      ...sourceVersion,
      id: clonedVersionId,
      status: 'draft',
      versionNumber: 3,
      scoringVersion: input.scoringVersion,
      metadata: input.metadata ?? sourceVersion.metadata,
    }),
    publishAssessmentVersion: async () => {
      throw new Error('not implemented');
    },
    updateDraftVersion: async () => {
      throw new Error('not implemented');
    },
    addScoreDimension: async () => {
      throw new Error('not implemented');
    },
    updateScoreDimension: async () => {
      throw new Error('not implemented');
    },
    removeScoreDimension: async () => {
      throw new Error('not implemented');
    },
    addQuestion: async () => {
      throw new Error('not implemented');
    },
    updateQuestion: async () => {
      throw new Error('not implemented');
    },
    removeQuestion: async () => {
      throw new Error('not implemented');
    },
    questionHasResponses: async () => false,
    addQuestionOption: async () => {
      throw new Error('not implemented');
    },
    updateQuestionOption: async () => {
      throw new Error('not implemented');
    },
    removeQuestionOption: async () => {
      throw new Error('not implemented');
    },
    addScoringRule: async () => {
      throw new Error('not implemented');
    },
    updateScoringRule: async () => {
      throw new Error('not implemented');
    },
    removeScoringRule: async () => {
      throw new Error('not implemented');
    },
  };

  const result = await runCandidateItemAuthoringWorkflow(
    {
      candidateItemRepository,
      assessmentReadRepository,
      assessmentWriteRepository,
    },
    {
      sourceAssessmentVersionId: sourceVersionId,
      targetTier: 'standard',
      draftScoringVersion: 'disc-v2-standard-30-draft-candidates-1',
      generationBatch: {
        generationId: 'wf-gen-001',
        sourceType: 'ai_assistant',
        modelName: 'gpt-5.3',
        promptVersion: 'disc-standard-authoring-v1',
        context: 'work',
        rationaleNotes: 'Initial practical authoring run for standard tier.',
        items: [
          {
            prompt: 'I naturally move projects forward even when plans are incomplete.',
            axis: 'tempo',
            axisDirection: 'highTempo',
            weight: 1,
            reverseKeyed: false,
            role: 'core',
            contextApplicability: ['work'],
            disambiguationTags: ['initiative', 'execution'],
            uncertaintyProfile: 'distinguish-D-vs-I',
            adaptiveEligible: true,
            itemPoolGroupIds: ['expanded-coverage'],
            routingTags: ['standard', 'expanded'],
            uncertaintyTargetAreas: ['secondary-dimension-separation'],
            aiGenerated: true,
            aiModel: 'gpt-5.3',
            aiPromptVersion: 'disc-standard-authoring-v1',
            aiRationale: 'Targets proactive tempo without explicit dominance wording.',
            aiConfidence: 0.86,
            aiSuggestedAlternatives: [],
          },
          {
            prompt: 'I prefer to pause and verify details before taking action.',
            axis: 'tempo',
            axisDirection: 'lowTempo',
            weight: 1,
            reverseKeyed: false,
            role: 'tiebreaker',
            contextApplicability: ['work'],
            disambiguationTags: ['pace-control', 'verification'],
            uncertaintyProfile: 'distinguish-S-vs-C',
            adaptiveEligible: true,
            itemPoolGroupIds: ['mirror-checks'],
            routingTags: ['standard', 'expanded'],
            uncertaintyTargetAreas: ['mirror-consistency'],
            aiGenerated: true,
            aiModel: 'gpt-5.3',
            aiPromptVersion: 'disc-standard-authoring-v1',
            aiRationale: 'Balances high-tempo item with deliberate pace behavior.',
            aiConfidence: 0.83,
            aiSuggestedAlternatives: [],
          },
        ],
      },
      reviews: [
        {
          itemIndex: 0,
          clarityScore: 0.92,
          ambiguityRisk: 0.16,
          doubleBarreledRisk: 0.08,
          socialDesirabilityRisk: 0.22,
          discriminationPotential: 0.85,
          mirrorUsefulness: 0.7,
          overlapRisk: 0.19,
          reviewerNotes: 'Strong standard-tier signal. Approve for pilot draft.',
          status: 'approved',
        },
        {
          itemIndex: 1,
          clarityScore: 0.74,
          ambiguityRisk: 0.29,
          doubleBarreledRisk: 0.11,
          socialDesirabilityRisk: 0.27,
          discriminationPotential: 0.65,
          mirrorUsefulness: 0.81,
          overlapRisk: 0.34,
          reviewerNotes: 'Useful but overlap risk still high; keep for revision.',
          status: 'needs_revision',
        },
      ],
    },
  );

  assert.equal(result.sourceVersion.id, sourceVersionId);
  assert.equal(result.sourceVersion.status, 'published');
  assert.equal(result.generationBatch.targetAssessmentDefinitionId, assessmentDefinitionId);
  assert.equal(result.importSummary.totalItems, 2);
  assert.equal(result.importSummary.importedItems, 2);
  assert.equal(result.reviewSummary.reviewedItems, 2);
  assert.equal(result.reviewSummary.approvedItems, 1);
  assert.equal(result.promotionSummary.promotedItems, 1);
  assert.equal(result.internalSummary.sourceVersion, 'disc-standard-30');
  assert.equal(result.internalSummary.newDraftVersion, 'disc-standard-30');
  assert.equal(result.internalSummary.importedCandidates, 2);
  assert.equal(result.internalSummary.approved, 1);
  assert.equal(result.internalSummary.rejected, 0);
  assert.equal(result.internalSummary.promoted, 1);
  assert.equal(result.internalSummary.distribution.approvedByAxisDirection.highTempo, 1);
  assert.equal(result.internalSummary.distribution.approvedByRole.core, 1);
  assert.equal(result.internalSummary.distribution.promotedByAxisDirection.highTempo, 1);
  assert.equal(result.internalSummary.distribution.promotedByRole.core, 1);
  assert.equal(result.draftVersion.id, clonedVersionId);
  assert.equal(result.draftVersion.status, 'draft');
});
