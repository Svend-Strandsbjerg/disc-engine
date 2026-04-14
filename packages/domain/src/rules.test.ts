import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProfileResult } from './rules.js';
import type { AssessmentVersion, Response } from './models.js';

const assessmentVersion: AssessmentVersion = {
  id: 'version-1',
  assessmentDefinitionId: 'definition-1',
  versionNumber: 1,
  scoringVersion: 'test-v1',
  status: 'published',
  questionCount: 2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  immutableAt: new Date('2026-01-01T00:00:00.000Z'),
  dimensions: [
    { id: 'dim-d', key: 'D', label: 'Drive', order: 1 },
    { id: 'dim-i', key: 'I', label: 'Influence', order: 2 },
  ],
  questions: [
    {
      id: 'q1',
      assessmentVersionId: 'version-1',
      code: 'Q1',
      prompt: 'Q1',
      type: 'single_choice',
      order: 1,
      required: true,
      options: [
        { id: 'q1o1', questionId: 'q1', code: 'D1', label: 'D', order: 1 },
        { id: 'q1o2', questionId: 'q1', code: 'I1', label: 'I', order: 2 },
      ],
    },
    {
      id: 'q2',
      assessmentVersionId: 'version-1',
      code: 'Q2',
      prompt: 'Q2',
      type: 'single_choice',
      order: 2,
      required: true,
      options: [
        { id: 'q2o1', questionId: 'q2', code: 'D2', label: 'D', order: 1 },
        { id: 'q2o2', questionId: 'q2', code: 'I2', label: 'I', order: 2 },
      ],
    },
  ],
  scoringRules: [
    {
      id: 'r1',
      assessmentVersionId: 'version-1',
      questionId: 'q1',
      optionId: 'q1o1',
      impacts: [{ dimensionKey: 'D', weight: 2 }],
    },
    {
      id: 'r2',
      assessmentVersionId: 'version-1',
      questionId: 'q2',
      optionId: 'q2o2',
      impacts: [{ dimensionKey: 'I', weight: 1 }],
    },
  ],
};

const responses: Response[] = [
  {
    id: 'response-1',
    sessionId: 'session-1',
    questionId: 'q1',
    selectedOptionIds: ['q1o1'],
    value: null,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  },
  {
    id: 'response-2',
    sessionId: 'session-1',
    questionId: 'q2',
    selectedOptionIds: ['q2o2'],
    value: null,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  },
];

test('calculateProfileResult aggregates scores by dimension', () => {
  const result = calculateProfileResult({ responses, assessmentVersion });

  assert.equal(result.scoringVersion, 'test-v1');
  assert.equal(result.profileCode, 'D');
  assert.deepEqual(result.totalScores, { D: 2, I: 1 });
  assert.equal(result.scoreBreakdown[0]?.normalizedScore, 100);
  assert.equal(result.scoreBreakdown[1]?.normalizedScore, 50);
});

test('calculateProfileResult is deterministic for the same inputs', () => {
  const first = calculateProfileResult({ responses, assessmentVersion });
  const second = calculateProfileResult({ responses, assessmentVersion });

  assert.deepEqual(first, second);
});

test('disc-v1-likert-16 uses total-share normalization for more stable profiles', () => {
  const discVersion: AssessmentVersion = {
    ...assessmentVersion,
    scoringVersion: 'disc-v1-likert-16',
  };

  const result = calculateProfileResult({ responses, assessmentVersion: discVersion });
  const d = result.scoreBreakdown.find((item) => item.dimensionKey === 'D');
  const i = result.scoreBreakdown.find((item) => item.dimensionKey === 'I');

  assert.equal(d?.normalizedScore, 66.67);
  assert.equal(i?.normalizedScore, 33.33);
});

test('disc-v2-axes derives D/I/S/C from axis scores with reverse and mirror consistency checks', () => {
  const axisVersion: AssessmentVersion = {
    ...assessmentVersion,
    scoringVersion: 'disc-v2-axes',
    dimensions: [
      { id: 'dim-d', key: 'D', label: 'Dominance', order: 1 },
      { id: 'dim-i', key: 'I', label: 'Influence', order: 2 },
      { id: 'dim-s', key: 'S', label: 'Steadiness', order: 3 },
      { id: 'dim-c', key: 'C', label: 'Conscientiousness', order: 4 },
    ],
    questions: [
      {
        id: 'q1',
        assessmentVersionId: 'version-1',
        code: 'Q1',
        prompt: 'Q1',
        type: 'single_choice',
        order: 1,
        required: true,
        metadata: {
          axis: 'tempo',
          axisDirection: 'highTempo',
          weight: 2,
          reverseKeyed: false,
          role: 'core',
        },
        options: [
          {
            id: 'q1o1',
            questionId: 'q1',
            code: 'sd',
            label: 'sd',
            order: 1,
            metadata: { intensity: 0 },
          },
          {
            id: 'q1o2',
            questionId: 'q1',
            code: 'sa',
            label: 'sa',
            order: 5,
            metadata: { intensity: 4 },
          },
        ],
      },
      {
        id: 'q2',
        assessmentVersionId: 'version-1',
        code: 'Q2',
        prompt: 'Q2',
        type: 'single_choice',
        order: 2,
        required: true,
        metadata: {
          axis: 'tempo',
          axisDirection: 'highTempo',
          weight: 1,
          reverseKeyed: true,
          role: 'mirror',
          mirrorOf: 'Q1',
        },
        options: [
          {
            id: 'q2o1',
            questionId: 'q2',
            code: 'sd',
            label: 'sd',
            order: 1,
            metadata: { intensity: 0 },
          },
          {
            id: 'q2o2',
            questionId: 'q2',
            code: 'sa',
            label: 'sa',
            order: 5,
            metadata: { intensity: 4 },
          },
        ],
      },
      {
        id: 'q3',
        assessmentVersionId: 'version-1',
        code: 'Q3',
        prompt: 'Q3',
        type: 'single_choice',
        order: 3,
        required: true,
        metadata: {
          axis: 'focus',
          axisDirection: 'taskFocus',
          weight: 1,
          reverseKeyed: false,
          role: 'core',
        },
        options: [
          {
            id: 'q3o1',
            questionId: 'q3',
            code: 'sd',
            label: 'sd',
            order: 1,
            metadata: { intensity: 0 },
          },
          {
            id: 'q3o2',
            questionId: 'q3',
            code: 'sa',
            label: 'sa',
            order: 5,
            metadata: { intensity: 4 },
          },
        ],
      },
    ],
  };

  const axisResponses: Response[] = [
    {
      id: 'response-1',
      sessionId: 'session-1',
      questionId: 'q1',
      selectedOptionIds: ['q1o2'],
      value: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: 'response-2',
      sessionId: 'session-1',
      questionId: 'q2',
      selectedOptionIds: ['q2o2'],
      value: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: 'response-3',
      sessionId: 'session-1',
      questionId: 'q3',
      selectedOptionIds: ['q3o2'],
      value: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];

  const result = calculateProfileResult({
    responses: axisResponses,
    assessmentVersion: axisVersion,
  });
  assert.deepEqual(result.totalScores, { D: 12, I: 8, S: 0, C: 4 });
  assert.equal(
    result.scoreBreakdown.find((item) => item.dimensionKey === 'D')?.normalizedScore,
    50,
  );

  const mirrorEvent = result.auditTrail.find(
    (event) => event.type === 'mirror_consistency_evaluated',
  );
  assert.deepEqual(mirrorEvent?.payload, {
    mirrorPairs: 1,
    mirrorContradictions: 1,
    contradictionRate: 1,
  });
});

test('disc-v3-item-bank captures item-level measurement analysis for pilot calibration', () => {
  const itemBankVersion: AssessmentVersion = {
    ...assessmentVersion,
    scoringVersion: 'disc-v3-item-bank',
    dimensions: [
      { id: 'dim-d', key: 'D', label: 'Dominance', order: 1 },
      { id: 'dim-i', key: 'I', label: 'Influence', order: 2 },
      { id: 'dim-s', key: 'S', label: 'Steadiness', order: 3 },
      { id: 'dim-c', key: 'C', label: 'Conscientiousness', order: 4 },
    ],
    questions: [
      {
        id: 'q1',
        assessmentVersionId: 'version-1',
        code: 'Q1',
        prompt: 'Q1',
        type: 'single_choice',
        order: 1,
        required: true,
        metadata: {
          axis: 'tempo',
          axisDirection: 'highTempo',
          weight: 2,
          reverseKeyed: false,
          role: 'core',
          contextApplicability: ['leadership'],
        },
        options: [
          {
            id: 'q1o1',
            questionId: 'q1',
            code: 'sd',
            label: 'sd',
            order: 1,
            metadata: { intensity: 0 },
          },
          {
            id: 'q1o2',
            questionId: 'q1',
            code: 'sa',
            label: 'sa',
            order: 5,
            metadata: { intensity: 4 },
          },
        ],
      },
      {
        id: 'q2',
        assessmentVersionId: 'version-1',
        code: 'Q2',
        prompt: 'Q2',
        type: 'single_choice',
        order: 2,
        required: true,
        metadata: {
          axis: 'tempo',
          axisDirection: 'highTempo',
          weight: 1,
          reverseKeyed: true,
          role: 'mirror',
          mirrorOf: 'Q1',
        },
        options: [
          {
            id: 'q2o1',
            questionId: 'q2',
            code: 'sd',
            label: 'sd',
            order: 1,
            metadata: { intensity: 0 },
          },
          {
            id: 'q2o2',
            questionId: 'q2',
            code: 'sa',
            label: 'sa',
            order: 5,
            metadata: { intensity: 4 },
          },
        ],
      },
      {
        id: 'q3',
        assessmentVersionId: 'version-1',
        code: 'Q3',
        prompt: 'Q3',
        type: 'single_choice',
        order: 3,
        required: true,
        metadata: {
          axis: 'focus',
          axisDirection: 'taskFocus',
          weight: 0.5,
          reverseKeyed: false,
          role: 'tiebreaker',
        },
        options: [
          {
            id: 'q3o1',
            questionId: 'q3',
            code: 'sd',
            label: 'sd',
            order: 1,
            metadata: { intensity: 0 },
          },
          {
            id: 'q3o2',
            questionId: 'q3',
            code: 'sa',
            label: 'sa',
            order: 5,
            metadata: { intensity: 4 },
          },
        ],
      },
    ],
  };

  const axisResponses: Response[] = [
    {
      id: 'response-1',
      sessionId: 'session-1',
      questionId: 'q1',
      selectedOptionIds: ['q1o2'],
      value: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: 'response-2',
      sessionId: 'session-1',
      questionId: 'q2',
      selectedOptionIds: ['q2o2'],
      value: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: 'response-3',
      sessionId: 'session-1',
      questionId: 'q3',
      selectedOptionIds: ['q3o2'],
      value: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];

  const result = calculateProfileResult({
    responses: axisResponses,
    assessmentVersion: itemBankVersion,
  });

  assert.deepEqual(result.totalScores, { D: 10, I: 8, S: 0, C: 2 });
  assert.equal(result.measurementAnalysis?.version, 'disc-v3-item-bank');
  assert.equal(result.measurementAnalysis?.itemContributions.length, 3);
  assert.equal(result.measurementAnalysis?.itemContributions[2]?.role, 'tiebreaker');
  assert.deepEqual(result.measurementAnalysis?.itemContributions[0]?.contextApplicability, [
    'leadership',
  ]);
  assert.deepEqual(result.measurementAnalysis?.mirrorConsistency, {
    mirrorPairs: 1,
    mirrorContradictions: 1,
    contradictionRate: 1,
    checks: [
      {
        mirrorQuestionCode: 'Q2',
        mirroredQuestionCode: 'Q1',
        mirrorResponseId: 'response-2',
        mirroredResponseId: 'response-1',
        mirrorAlignedValue: 0,
        mirroredAlignedValue: 4,
        comparisonScaleMax: 4,
        contradictionThreshold: 2,
        absoluteDifference: 4,
        contradicted: true,
      },
    ],
  });
  assert.deepEqual(result.measurementAnalysis?.responseDistributions, [
    {
      questionId: 'q1',
      questionCode: 'Q1',
      axisDirection: 'highTempo',
      role: 'core',
      responseCount: 1,
      optionSelections: { sa: 1 },
    },
    {
      questionId: 'q2',
      questionCode: 'Q2',
      axisDirection: 'highTempo',
      role: 'mirror',
      responseCount: 1,
      optionSelections: { sa: 1 },
    },
    {
      questionId: 'q3',
      questionCode: 'Q3',
      axisDirection: 'taskFocus',
      role: 'tiebreaker',
      responseCount: 1,
      optionSelections: { sa: 1 },
    },
  ]);
  assert.deepEqual(result.measurementAnalysis?.diagnostics, {
    missingMetadataQuestionIds: [],
    mirrorOrphans: [],
    zeroWeightQuestionIds: [],
    negativeWeightQuestionIds: [],
  });
});
