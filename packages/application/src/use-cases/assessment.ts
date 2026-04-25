import type { AssessmentReadRepository } from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

const DISC_PRODUCT_LINE = 'disc' as const;
const DISC_SEED_INSTRUCTIONS = 'Run `pnpm prisma:seed` to provision the baseline DISC versions.';

const DISC_VERSION_DEFINITIONS = [
  {
    versionKey: 'disc-free-16',
    tier: 'free',
    itemCount: 16,
    estimatedCompletionMinutes: 5,
    intendedUse: 'Fast individual self-discovery and onboarding previews.',
    deliveryMode: 'fixed_form',
  },
  {
    versionKey: 'disc-standard-30',
    tier: 'standard',
    itemCount: 30,
    estimatedCompletionMinutes: 9,
    intendedUse: 'Balanced people-development and team coaching workflows.',
    deliveryMode: 'fixed_form',
  },
  {
    versionKey: 'disc-deep-80',
    tier: 'deep',
    itemCount: 80,
    estimatedCompletionMinutes: 22,
    intendedUse: 'High-resolution insights for coaching, talent, and diagnostics.',
    deliveryMode: 'adaptive_ready',
  },
] as const;

export const getAssessmentVersionMetadata = async (
  deps: { assessmentReadRepository: AssessmentReadRepository },
  versionId: UUID,
) => {
  const version = await deps.assessmentReadRepository.getVersion(versionId);
  if (!version) {
    return null;
  }

  return {
    id: version.id,
    assessmentDefinitionId: version.assessmentDefinitionId,
    versionNumber: version.versionNumber,
    scoringVersion: version.scoringVersion,
    metadata: version.metadata,
    status: version.status,
    questionCount: version.questionCount,
    dimensions: version.dimensions.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      order: dimension.order,
    })),
    publishedAt: version.publishedAt,
    immutableAt: version.immutableAt,
  };
};

export const listDiscProductVersions = async (deps: {
  assessmentReadRepository: AssessmentReadRepository;
}) => {
  const versionRecords =
    await deps.assessmentReadRepository.listLatestPublishedVersionsByVersionKeys(
      DISC_VERSION_DEFINITIONS.map((definition) => definition.versionKey),
    );

  const byKey = new Map(versionRecords.map((record) => [record.assessmentVersionKey, record]));

  const versions = DISC_VERSION_DEFINITIONS.flatMap((definition) => {
    const record = byKey.get(definition.versionKey);
    if (!record) {
      return [];
    }

    return {
      key: definition.versionKey,
      tier: definition.tier,
      assessmentVersionId: record.assessmentVersionId,
      itemCount: definition.itemCount,
      estimatedCompletionMinutes: definition.estimatedCompletionMinutes,
      intendedUse: definition.intendedUse,
      deliveryMode: definition.deliveryMode,
    };
  });

  if (versions.length === 0) {
    throw new Error(
      `No published DISC assessment versions are available for product line "${DISC_PRODUCT_LINE}". ${DISC_SEED_INSTRUCTIONS}`,
    );
  }

  return {
    productLine: DISC_PRODUCT_LINE,
    versions,
  };
};
