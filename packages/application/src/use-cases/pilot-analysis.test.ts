import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessmentVersion } from '@disc-foundation/domain';
import type { AssessmentReadRepository, ResultQueryRepository } from '../ports/repositories.js';
import { getPilotItemBankAnalysis } from './pilot-analysis.js';

const assessmentVersion: AssessmentVersion = {
  id: '00000000-0000-0000-0000-000000000100',
  assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
  versionNumber: 3,
  scoringVersion: 'disc-v3-item-bank',
  metadata: {
    assessmentVersionKey: 'disc-standard-30',
    tier: 'standard',
    intendedUse: 'pilot analysis fixture',
    expectedItemCount: 2,
    expectedCompletionTimeMinutes: 2,
    form: 'future_adaptive_ready',
    adaptive: {
      adaptiveEligible: true,
      itemPoolGroupIds: ['tempo-core'],
      uncertaintyTargetAreas: ['d-i-separation'],
      routingTags: ['fixture'],
    },
  },
  status: 'published',
  questionCount: 2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  dimensions: [
    { id: 'd1', key: 'D', label: 'Dominance', order: 1 },
    { id: 'd2', key: 'I', label: 'Influence', order: 2 },
    { id: 'd3', key: 'S', label: 'Steadiness', order: 3 },
    { id: 'd4', key: 'C', label: 'Conscientiousness', order: 4 },
  ],
  scoringRules: [],
  questions: [
    {
      id: '00000000-0000-0000-0000-000000000201',
      assessmentVersionId: '00000000-0000-0000-0000-000000000100',
      code: 'Q1',
      prompt: 'Core question',
      type: 'single_choice',
      order: 1,
      required: true,
      metadata: {
        role: 'core',
        axisDirection: 'highTempo',
      },
      options: [
        { id: 'o1', questionId: 'q1', code: 'A', label: 'A', order: 0 },
        { id: 'o2', questionId: 'q1', code: 'B', label: 'B', order: 1 },
        { id: 'o3', questionId: 'q1', code: 'C', label: 'C', order: 2 },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000202',
      assessmentVersionId: '00000000-0000-0000-0000-000000000100',
      code: 'Q2',
      prompt: 'Mirror question',
      type: 'single_choice',
      order: 2,
      required: true,
      metadata: {
        role: 'mirror',
        mirrorOf: 'Q1',
        axisDirection: 'highTempo',
      },
      options: [
        { id: 'm1', questionId: 'q2', code: 'A', label: 'A', order: 0 },
        { id: 'm2', questionId: 'q2', code: 'B', label: 'B', order: 1 },
        { id: 'm3', questionId: 'q2', code: 'C', label: 'C', order: 2 },
      ],
    },
  ],
};

const assessmentReadRepository: AssessmentReadRepository = {
  getVersion: async () => assessmentVersion,
  getActivePublishedVersion: async () => assessmentVersion,
};

const resultQueryRepository: ResultQueryRepository = {
  getResultById: async () => null,
  getResultBySessionId: async () => null,
  getSessionDetail: async () => null,
  listResultsByAssessmentDefinition: async () => ({ total: 0, items: [], dimensionKeys: [] }),
  listResultsByAssessmentVersion: async () => ({
    total: 2,
    dimensionKeys: ['D', 'I', 'S', 'C'],
    items: [
      {
        resultId: 'r1',
        sessionId: 's1',
        assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
        assessmentVersionId: '00000000-0000-0000-0000-000000000100',
        scoringVersion: 'disc-v3-item-bank',
        status: 'completed',
        calculatedAt: new Date('2026-02-01T00:00:00.000Z'),
        scoreBreakdown: [
          { dimensionKey: 'D', dimensionLabel: 'D', rawScore: 4, normalizedScore: 95, evidence: [] },
          { dimensionKey: 'I', dimensionLabel: 'I', rawScore: 1, normalizedScore: 40, evidence: [] },
        ],
        totalScores: { D: 4, I: 1, S: 0, C: 0 },
        rawResponsesSnapshot: [
          {
            id: 'resp-1',
            sessionId: 's1',
            questionId: '00000000-0000-0000-0000-000000000201',
            selectedOptionIds: ['o3'],
            value: null,
            createdAt: new Date('2026-02-01T00:00:00.000Z'),
            updatedAt: new Date('2026-02-01T00:00:00.000Z'),
          },
          {
            id: 'resp-2',
            sessionId: 's1',
            questionId: '00000000-0000-0000-0000-000000000202',
            selectedOptionIds: ['m1'],
            value: null,
            createdAt: new Date('2026-02-01T00:00:00.000Z'),
            updatedAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        ],
        auditTrailSummary: { eventCount: 1, eventTypes: [] },
        sessionTimestamps: { startedAt: new Date('2026-02-01T00:00:00.000Z') },
      },
      {
        resultId: 'r2',
        sessionId: 's2',
        assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
        assessmentVersionId: '00000000-0000-0000-0000-000000000100',
        scoringVersion: 'disc-v3-item-bank',
        status: 'completed',
        calculatedAt: new Date('2026-02-02T00:00:00.000Z'),
        scoreBreakdown: [
          { dimensionKey: 'D', dimensionLabel: 'D', rawScore: 5, normalizedScore: 90, evidence: [] },
          { dimensionKey: 'I', dimensionLabel: 'I', rawScore: 2, normalizedScore: 55, evidence: [] },
        ],
        totalScores: { D: 5, I: 2, S: 0, C: 0 },
        rawResponsesSnapshot: [
          {
            id: 'resp-3',
            sessionId: 's2',
            questionId: '00000000-0000-0000-0000-000000000201',
            selectedOptionIds: ['o3'],
            value: null,
            createdAt: new Date('2026-02-02T00:00:00.000Z'),
            updatedAt: new Date('2026-02-02T00:00:00.000Z'),
          },
          {
            id: 'resp-4',
            sessionId: 's2',
            questionId: '00000000-0000-0000-0000-000000000202',
            selectedOptionIds: ['m1'],
            value: null,
            createdAt: new Date('2026-02-02T00:00:00.000Z'),
            updatedAt: new Date('2026-02-02T00:00:00.000Z'),
          },
        ],
        auditTrailSummary: { eventCount: 1, eventTypes: [] },
        sessionTimestamps: { startedAt: new Date('2026-02-02T00:00:00.000Z') },
      },
    ],
  }),
};

test('getPilotItemBankAnalysis aggregates completed sessions and flags weak items', async () => {
  const analysis = await getPilotItemBankAnalysis(
    { assessmentReadRepository, resultQueryRepository },
    {
      assessmentVersionId: '00000000-0000-0000-0000-000000000100',
      minSampleSize: 2,
      concentrationThreshold: 0.8,
      separationThreshold: 0.8,
      mirrorContradictionThreshold: 0.3,
    },
  );

  assert.equal(analysis.sample.sessionCount, 2);
  assert.equal(analysis.summary.itemCount, 2);

  const core = analysis.items.find((item) => item.questionCode === 'Q1');
  assert.ok(core);
  assert.equal(core.concentrationRatio, 1);
  assert.ok(core.weakItemFlags.some((flag) => flag.type === 'high_concentration'));

  const mirror = analysis.items.find((item) => item.questionCode === 'Q2');
  assert.ok(mirror);
  assert.equal(mirror.mirrorContradictionRate, 1);
  assert.ok(mirror.weakItemFlags.some((flag) => flag.type === 'high_mirror_contradiction'));
});
