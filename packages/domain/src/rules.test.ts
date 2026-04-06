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
