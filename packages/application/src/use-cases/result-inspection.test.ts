import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessmentSession, AssessmentVersion, ProfileResult } from '@disc-foundation/domain';
import type {
  AssessmentReadRepository,
  AssessmentSessionRepository,
  ResultRepository,
} from '../ports/repositories.js';
import { getCompletedSessionInspection } from './result.js';

const assessmentVersion: AssessmentVersion = {
  id: '00000000-0000-0000-0000-000000000100',
  assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
  versionNumber: 3,
  scoringVersion: 'disc-v3-item-bank',
  metadata: {
    assessmentVersionKey: 'disc-deep-80',
    tier: 'deep',
    intendedUse: 'inspection fixture',
    expectedItemCount: 2,
    expectedCompletionTimeMinutes: 2,
    form: 'future_adaptive_ready',
    adaptive: {
      adaptiveEligible: true,
      itemPoolGroupIds: ['focus-disambiguation'],
      uncertaintyTargetAreas: ['mirror-consistency'],
      routingTags: ['fixture'],
    },
  },
  status: 'published',
  questionCount: 2,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  dimensions: [
    { id: 'd1', key: 'D', label: 'Dominance', order: 1 },
    { id: 'd2', key: 'I', label: 'Influence', order: 2 },
    { id: 'd3', key: 'S', label: 'Steadiness', order: 3 },
    { id: 'd4', key: 'C', label: 'Conscientiousness', order: 4 },
  ],
  scoringRules: [],
  questions: [
    {
      id: 'q1',
      assessmentVersionId: '00000000-0000-0000-0000-000000000100',
      code: 'Q1',
      prompt: 'I act quickly under pressure.',
      type: 'single_choice',
      order: 1,
      required: true,
      metadata: {
        axis: 'tempo',
        axisDirection: 'highTempo',
        role: 'core',
        weight: 2,
      },
      options: [
        { id: 'o1', questionId: 'q1', code: 'A', label: 'Rarely', order: 0 },
        { id: 'o2', questionId: 'q1', code: 'B', label: 'Sometimes', order: 1 },
        { id: 'o3', questionId: 'q1', code: 'C', label: 'Often', order: 2 },
      ],
    },
    {
      id: 'q2',
      assessmentVersionId: '00000000-0000-0000-0000-000000000100',
      code: 'Q2',
      prompt: 'I prefer clear procedures.',
      type: 'single_choice',
      order: 2,
      required: true,
      metadata: {
        axis: 'focus',
        axisDirection: 'taskFocus',
        role: 'core',
        weight: 1,
      },
      options: [
        { id: 'p1', questionId: 'q2', code: 'A', label: 'Rarely', order: 0 },
        { id: 'p2', questionId: 'q2', code: 'B', label: 'Sometimes', order: 1 },
        { id: 'p3', questionId: 'q2', code: 'C', label: 'Often', order: 2 },
      ],
    },
  ],
};

const session: AssessmentSession = {
  id: '00000000-0000-0000-0000-000000000200',
  assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
  assessmentVersionId: '00000000-0000-0000-0000-000000000100',
  status: 'completed',
  metadata: {},
  startedAt: new Date('2026-03-02T00:00:00.000Z'),
  completedAt: new Date('2026-03-02T00:05:00.000Z'),
};

const result: ProfileResult = {
  id: '00000000-0000-0000-0000-000000000300',
  sessionId: session.id,
  assessmentVersionId: assessmentVersion.id,
  scoringVersion: 'disc-v3-item-bank',
  profileCode: 'D',
  scoreBreakdown: [
    { dimensionKey: 'D', dimensionLabel: 'D', rawScore: 9, normalizedScore: 100, evidence: [] },
    { dimensionKey: 'I', dimensionLabel: 'I', rawScore: 6, normalizedScore: 66.67, evidence: [] },
    { dimensionKey: 'C', dimensionLabel: 'C', rawScore: 3, normalizedScore: 33.33, evidence: [] },
    { dimensionKey: 'S', dimensionLabel: 'S', rawScore: 0, normalizedScore: 0, evidence: [] },
  ],
  totalScores: { D: 9, I: 6, C: 3, S: 0 },
  rawResponsesSnapshot: [
    {
      id: 'r1',
      sessionId: session.id,
      questionId: 'q1',
      selectedOptionIds: ['o3'],
      value: null,
      createdAt: new Date('2026-03-02T00:01:00.000Z'),
      updatedAt: new Date('2026-03-02T00:01:00.000Z'),
    },
    {
      id: 'r2',
      sessionId: session.id,
      questionId: 'q2',
      selectedOptionIds: ['p3'],
      value: null,
      createdAt: new Date('2026-03-02T00:02:00.000Z'),
      updatedAt: new Date('2026-03-02T00:02:00.000Z'),
    },
  ],
  calculatedAt: new Date('2026-03-02T00:05:00.000Z'),
  auditTrail: [
    {
      id: 'evt-1',
      occurredAt: new Date('2026-03-02T00:05:00.000Z'),
      type: 'disc_derived_from_axes',
      payload: {
        axisDirectionScores: {
          highTempo: 6,
          lowTempo: 0,
          taskFocus: 3,
          peopleFocus: 0,
        },
        derivedDiscScores: {
          D: 9,
          I: 6,
          S: 0,
          C: 3,
        },
      },
    },
    {
      id: 'evt-2',
      occurredAt: new Date('2026-03-02T00:05:00.000Z'),
      type: 'mirror_consistency_evaluated',
      payload: {
        mirrorPairs: 1,
        mirrorContradictions: 0,
        contradictionRate: 0,
      },
    },
  ],
  measurementAnalysis: {
    version: 'disc-v3-item-bank',
    itemContributions: [
      {
        questionId: 'q1',
        questionCode: 'Q1',
        responseId: 'r1',
        axis: 'tempo',
        axisDirection: 'highTempo',
        role: 'core',
        reverseKeyed: false,
        selectedOptionId: 'o3',
        selectedOptionCode: 'C',
        selectedOptionOrder: 2,
        selectedIntensity: 3,
        alignedValue: 3,
        weight: 2,
        weightedContribution: 6,
      },
      {
        questionId: 'q2',
        questionCode: 'Q2',
        responseId: 'r2',
        axis: 'focus',
        axisDirection: 'taskFocus',
        role: 'core',
        reverseKeyed: false,
        selectedOptionId: 'p3',
        selectedOptionCode: 'C',
        selectedOptionOrder: 2,
        selectedIntensity: 3,
        alignedValue: 3,
        weight: 1,
        weightedContribution: 3,
      },
    ],
    mirrorConsistency: {
      mirrorPairs: 1,
      mirrorContradictions: 0,
      contradictionRate: 0,
      checks: [],
    },
    responseDistributions: [
      {
        questionId: 'q1',
        questionCode: 'Q1',
        axisDirection: 'highTempo',
        role: 'core',
        responseCount: 1,
        optionSelections: { C: 1 },
      },
      {
        questionId: 'q2',
        questionCode: 'Q2',
        axisDirection: 'taskFocus',
        role: 'core',
        responseCount: 1,
        optionSelections: { C: 1 },
      },
    ],
    diagnostics: {
      missingMetadataQuestionIds: [],
      mirrorOrphans: [],
      zeroWeightQuestionIds: [],
      negativeWeightQuestionIds: [],
    },
  },
};

const assessmentReadRepository: AssessmentReadRepository = {
  getVersion: async () => assessmentVersion,
  getActivePublishedVersion: async () => assessmentVersion,
  listLatestPublishedVersionsByDefinitionKeys: async () => [],
};

const assessmentSessionRepository: AssessmentSessionRepository = {
  createSession: async () => session,
  getSession: async () => session,
  completeSession: async () => undefined,
  getSessionSummary: async () => null,
};

const resultRepository: ResultRepository = {
  saveResultAndCompleteSession: async () => undefined,
  getResultBySession: async () => result,
};

test('getCompletedSessionInspection returns selected answers and item influence diagnostics', async () => {
  const inspection = await getCompletedSessionInspection(
    { assessmentReadRepository, assessmentSessionRepository, resultRepository },
    session.id,
  );

  assert.equal(inspection.profile.profileCode, 'D');
  assert.equal(inspection.selectedAnswers.length, 2);
  assert.equal(inspection.selectedAnswers[0]?.selectedOptions[0]?.optionCode, 'C');
  assert.equal(inspection.axisScoring.axisDirectionScores?.highTempo, 6);
  assert.equal(inspection.itemInsights.length, 2);
  assert.equal(inspection.itemInsights[0]?.influencedFinalProfile, true);
  assert.ok(inspection.explanation.includes('Most influential items'));
});

test('getCompletedSessionInspection rejects sessions that are not completed', async () => {
  const inProgressRepository: AssessmentSessionRepository = {
    ...assessmentSessionRepository,
    getSession: async () => {
      const { completedAt: _completedAt, ...inProgressSession } = session;
      return { ...inProgressSession, status: 'in_progress' };
    },
  };

  await assert.rejects(
    getCompletedSessionInspection(
      { assessmentReadRepository, assessmentSessionRepository: inProgressRepository, resultRepository },
      session.id,
    ),
    /Session is not completed/,
  );
});
