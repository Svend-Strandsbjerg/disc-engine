import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessmentSession, AssessmentVersion } from '@disc-foundation/domain';
import type { AssessmentReadRepository, AssessmentSessionRepository } from '../ports/repositories.js';
import { getSessionQuestions } from './session.js';

const buildVersion = (): AssessmentVersion => ({
  id: '00000000-0000-0000-0000-000000000100',
  assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
  versionNumber: 1,
  scoringVersion: 'v1',
  metadata: {
    assessmentVersionKey: 'disc-free-16',
    tier: 'free',
    intendedUse: 'screening',
    expectedItemCount: 2,
    expectedCompletionTimeMinutes: 2,
    form: 'fixed_form',
    adaptive: {
      adaptiveEligible: false,
      itemPoolGroupIds: [],
      uncertaintyTargetAreas: [],
      routingTags: [],
    },
  },
  status: 'published',
  questionCount: 2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  immutableAt: new Date('2026-01-02T00:00:00.000Z'),
  dimensions: [],
  scoringRules: [],
  questions: [
    {
      id: '00000000-0000-0000-0000-000000000201',
      assessmentVersionId: '00000000-0000-0000-0000-000000000100',
      code: 'Q2',
      prompt: 'Second question',
      type: 'text',
      order: 2,
      required: true,
      options: [],
    },
    {
      id: '00000000-0000-0000-0000-000000000200',
      assessmentVersionId: '00000000-0000-0000-0000-000000000100',
      code: 'Q1',
      prompt: 'First question',
      type: 'single_choice',
      order: 1,
      required: true,
      options: [
        {
          id: '00000000-0000-0000-0000-000000000302',
          questionId: '00000000-0000-0000-0000-000000000200',
          code: 'B',
          label: 'Option B',
          order: 2,
        },
        {
          id: '00000000-0000-0000-0000-000000000301',
          questionId: '00000000-0000-0000-0000-000000000200',
          code: 'A',
          label: 'Option A',
          order: 1,
        },
      ],
    },
  ],
});

const buildSession = (): AssessmentSession => ({
  id: '00000000-0000-0000-0000-000000000001',
  assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
  assessmentVersionId: '00000000-0000-0000-0000-000000000100',
  status: 'in_progress',
  startedAt: new Date('2026-01-03T00:00:00.000Z'),
});

const createAssessmentSessionRepositoryMock = (
  overrides: Partial<AssessmentSessionRepository> = {},
): AssessmentSessionRepository => ({
  createSession: async () => buildSession(),
  getSession: async () => buildSession(),
  completeSession: async () => undefined,
  getSessionSummary: async () => null,
  ...overrides,
});

const createAssessmentReadRepositoryMock = (
  overrides: Partial<AssessmentReadRepository> = {},
): AssessmentReadRepository => ({
  getVersion: async () => buildVersion(),
  getActivePublishedVersion: async () => buildVersion(),
  ...overrides,
});

test('getSessionQuestions returns ordered render-ready question payload for the session version', async () => {
  const deps = {
    assessmentSessionRepository: createAssessmentSessionRepositoryMock({
      getSession: async () => buildSession(),
    }),
    assessmentReadRepository: createAssessmentReadRepositoryMock({
      getVersion: async () => buildVersion(),
    }),
  };

  const result = await getSessionQuestions(deps, '00000000-0000-0000-0000-000000000001');

  assert.deepEqual(result, {
    sessionId: '00000000-0000-0000-0000-000000000001',
    assessmentVersionId: '00000000-0000-0000-0000-000000000100',
    questions: [
      {
        id: '00000000-0000-0000-0000-000000000200',
        prompt: 'First question',
        text: 'First question',
        order: 1,
        index: 1,
        responseType: 'single_choice',
        options: [
          {
            id: '00000000-0000-0000-0000-000000000301',
            label: 'Option A',
            order: 1,
            index: 1,
          },
          {
            id: '00000000-0000-0000-0000-000000000302',
            label: 'Option B',
            order: 2,
            index: 2,
          },
        ],
      },
      {
        id: '00000000-0000-0000-0000-000000000201',
        prompt: 'Second question',
        text: 'Second question',
        order: 2,
        index: 2,
        responseType: 'text',
      },
    ],
  });
});

test('getSessionQuestions throws when the session cannot be found', async () => {
  const deps = {
    assessmentSessionRepository: createAssessmentSessionRepositoryMock({
      getSession: async () => null,
    }),
    assessmentReadRepository: createAssessmentReadRepositoryMock({
      getVersion: async () => buildVersion(),
    }),
  };

  await assert.rejects(
    () => getSessionQuestions(deps, '00000000-0000-0000-0000-000000000001'),
    /Session not found/,
  );
});

test('getSessionQuestions throws when the session version reference cannot be resolved', async () => {
  const deps = {
    assessmentSessionRepository: createAssessmentSessionRepositoryMock({
      getSession: async () => buildSession(),
    }),
    assessmentReadRepository: createAssessmentReadRepositoryMock({
      getVersion: async () => null,
    }),
  };

  await assert.rejects(
    () => getSessionQuestions(deps, '00000000-0000-0000-0000-000000000001'),
    /Session assessment version not found/,
  );
});

test('getSessionQuestions throws when the session version has no questions', async () => {
  const deps = {
    assessmentSessionRepository: createAssessmentSessionRepositoryMock({
      getSession: async () => buildSession(),
    }),
    assessmentReadRepository: createAssessmentReadRepositoryMock({
      getVersion: async () => ({
        ...buildVersion(),
        questionCount: 0,
        questions: [],
      }),
    }),
  };

  await assert.rejects(
    () => getSessionQuestions(deps, '00000000-0000-0000-0000-000000000001'),
    /Session assessment questions not found/,
  );
});
