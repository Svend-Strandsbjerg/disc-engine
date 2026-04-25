import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssessmentReadRepository } from '../ports/repositories.js';
import { listDiscProductVersions } from './assessment.js';

const createAssessmentReadRepositoryMock = (
  overrides: Partial<AssessmentReadRepository> = {},
): AssessmentReadRepository => ({
  getVersion: async () => null,
  getActivePublishedVersion: async () => null,
  listLatestPublishedVersionsByVersionKeys: async () => [],
  ...overrides,
});

test('listDiscProductVersions lists published DISC tiers with frontend metadata', async () => {
  const result = await listDiscProductVersions({
    assessmentReadRepository: createAssessmentReadRepositoryMock({
      listLatestPublishedVersionsByVersionKeys: async () => [
        {
          assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
          assessmentVersionKey: 'disc-free-16',
          assessmentVersionId: '00000000-0000-0000-0000-000000000201',
          versionNumber: 4,
          publishedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
        {
          assessmentDefinitionId: '00000000-0000-0000-0000-000000000102',
          assessmentVersionKey: 'disc-standard-30',
          assessmentVersionId: '00000000-0000-0000-0000-000000000202',
          versionNumber: 2,
          publishedAt: new Date('2026-03-02T00:00:00.000Z'),
        },
        {
          assessmentDefinitionId: '00000000-0000-0000-0000-000000000103',
          assessmentVersionKey: 'disc-deep-80',
          assessmentVersionId: '00000000-0000-0000-0000-000000000203',
          versionNumber: 1,
          publishedAt: new Date('2026-03-03T00:00:00.000Z'),
        },
      ],
    }),
  });

  assert.deepEqual(result, {
    productLine: 'disc',
    versions: [
      {
        key: 'disc-free-16',
        tier: 'free',
        assessmentVersionId: '00000000-0000-0000-0000-000000000201',
        itemCount: 16,
        estimatedCompletionMinutes: 5,
        intendedUse: 'Fast individual self-discovery and onboarding previews.',
        deliveryMode: 'fixed_form',
      },
      {
        key: 'disc-standard-30',
        tier: 'standard',
        assessmentVersionId: '00000000-0000-0000-0000-000000000202',
        itemCount: 30,
        estimatedCompletionMinutes: 9,
        intendedUse: 'Balanced people-development and team coaching workflows.',
        deliveryMode: 'fixed_form',
      },
      {
        key: 'disc-deep-80',
        tier: 'deep',
        assessmentVersionId: '00000000-0000-0000-0000-000000000203',
        itemCount: 80,
        estimatedCompletionMinutes: 22,
        intendedUse: 'High-resolution insights for coaching, talent, and diagnostics.',
        deliveryMode: 'adaptive_ready',
      },
    ],
  });
});

test('listDiscProductVersions excludes unpublished or unavailable tiers', async () => {
  const result = await listDiscProductVersions({
    assessmentReadRepository: createAssessmentReadRepositoryMock({
      listLatestPublishedVersionsByVersionKeys: async () => [
        {
          assessmentDefinitionId: '00000000-0000-0000-0000-000000000102',
          assessmentVersionKey: 'disc-standard-30',
          assessmentVersionId: '00000000-0000-0000-0000-000000000202',
          versionNumber: 3,
          publishedAt: new Date('2026-03-02T00:00:00.000Z'),
        },
      ],
    }),
  });

  assert.deepEqual(result, {
    productLine: 'disc',
    versions: [
      {
        key: 'disc-standard-30',
        tier: 'standard',
        assessmentVersionId: '00000000-0000-0000-0000-000000000202',
        itemCount: 30,
        estimatedCompletionMinutes: 9,
        intendedUse: 'Balanced people-development and team coaching workflows.',
        deliveryMode: 'fixed_form',
      },
    ],
  });
});

test('listDiscProductVersions keeps deterministic order regardless of repository order', async () => {
  const result = await listDiscProductVersions({
    assessmentReadRepository: createAssessmentReadRepositoryMock({
      listLatestPublishedVersionsByVersionKeys: async () => [
        {
          assessmentDefinitionId: '00000000-0000-0000-0000-000000000103',
          assessmentVersionKey: 'disc-deep-80',
          assessmentVersionId: '00000000-0000-0000-0000-000000000203',
          versionNumber: 1,
          publishedAt: new Date('2026-03-03T00:00:00.000Z'),
        },
        {
          assessmentDefinitionId: '00000000-0000-0000-0000-000000000101',
          assessmentVersionKey: 'disc-free-16',
          assessmentVersionId: '00000000-0000-0000-0000-000000000201',
          versionNumber: 1,
          publishedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ],
    }),
  });

  assert.deepEqual(
    result.versions.map((version) => ({ key: version.key, tier: version.tier })),
    [
      { key: 'disc-free-16', tier: 'free' },
      { key: 'disc-deep-80', tier: 'deep' },
    ],
  );
});

test('listDiscProductVersions fails clearly when no DISC versions are published', async () => {
  await assert.rejects(
    () =>
      listDiscProductVersions({
        assessmentReadRepository: createAssessmentReadRepositoryMock({
          listLatestPublishedVersionsByVersionKeys: async () => [],
        }),
      }),
    /No published DISC assessment versions are available/,
  );
});
