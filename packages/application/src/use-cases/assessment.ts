import type { AssessmentReadRepository } from '../ports/repositories.js';
import type { UUID } from '@disc-engine/shared';

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
