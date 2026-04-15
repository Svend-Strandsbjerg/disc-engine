import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssessmentVersionForPublish } from './validation.js';
import type { AssessmentVersion } from './models.js';

const baseVersion: AssessmentVersion = {
  id: 'version-1',
  assessmentDefinitionId: 'definition-1',
  versionNumber: 1,
  scoringVersion: 'v1',
  metadata: {
    assessmentVersionKey: 'disc-validation-1',
    tier: 'free',
    intendedUse: 'validation fixture',
    expectedItemCount: 1,
    expectedCompletionTimeMinutes: 1,
    form: 'fixed_form',
    adaptive: {
      adaptiveEligible: false,
      itemPoolGroupIds: [],
      uncertaintyTargetAreas: [],
      routingTags: [],
    },
  },
  status: 'draft',
  questionCount: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  dimensions: [
    { id: 'dim-d', key: 'D', label: 'Drive', order: 1 },
    { id: 'dim-i', key: 'I', label: 'Influence', order: 2 },
  ],
  questions: [
    {
      id: 'q1',
      assessmentVersionId: 'version-1',
      code: 'Q1',
      prompt: 'Question 1',
      type: 'single_choice',
      order: 1,
      required: true,
      options: [
        { id: 'q1o1', questionId: 'q1', code: 'A', label: 'A', order: 1 },
        { id: 'q1o2', questionId: 'q1', code: 'B', label: 'B', order: 2 },
      ],
    },
  ],
  scoringRules: [
    {
      id: 'r1',
      assessmentVersionId: 'version-1',
      questionId: 'q1',
      optionId: 'q1o1',
      impacts: [{ dimensionKey: 'D', weight: 1 }],
    },
    {
      id: 'r2',
      assessmentVersionId: 'version-1',
      questionId: 'q1',
      optionId: 'q1o2',
      impacts: [{ dimensionKey: 'I', weight: 1 }],
    },
  ],
};

test('validateAssessmentVersionForPublish marks complete versions as publishable with warnings allowed', () => {
  const result = validateAssessmentVersionForPublish(baseVersion);

  assert.equal(result.isPublishable, true);
  assert.equal(result.errors.length, 0);
  assert.ok(result.warnings.some((warning) => warning.code === 'LOW_QUESTION_COUNT'));
});

test('validateAssessmentVersionForPublish returns blocking errors for broken references and uncovered options', () => {
  const broken: AssessmentVersion = {
    ...baseVersion,
    scoringRules: [
      {
        id: 'broken-rule',
        assessmentVersionId: 'version-1',
        questionId: 'missing-question',
        optionId: 'missing-option',
        impacts: [{ dimensionKey: 'missing-dimension', weight: 1 }],
      },
    ],
  };

  const result = validateAssessmentVersionForPublish(broken);

  assert.equal(result.isPublishable, false);
  assert.ok(result.errors.some((error) => error.code === 'RULE_MISSING_QUESTION'));
  assert.ok(result.errors.some((error) => error.code === 'OPTION_WITHOUT_SCORING_COVERAGE'));
});
