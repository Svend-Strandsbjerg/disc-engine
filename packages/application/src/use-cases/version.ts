import { assertVersionEditable } from '@disc-engine/domain';
import type {
  AssessmentReadRepository,
  AssessmentWriteRepository,
} from '../ports/repositories.js';
import type { AssessmentVersion } from '@disc-engine/domain';
import type { UUID } from '@disc-engine/shared';

export const updateDraftVersion = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  versionId: UUID,
  mutate: (version: AssessmentVersion) => AssessmentVersion,
) => {
  const current = await deps.assessmentReadRepository.getVersion(versionId);
  if (!current) {
    throw new Error('Assessment version not found');
  }

  assertVersionEditable(current);
  const nextVersion = mutate(current);

  // TODO: Future admin/update endpoints must route version writes through this guard.
  return deps.assessmentWriteRepository.updateDraftVersion(nextVersion);
};
