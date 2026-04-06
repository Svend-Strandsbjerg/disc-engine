import { z } from 'zod';
import {
  validateAssessmentVersionForPublish,
  type AssessmentVersionValidationResult,
} from '@disc-foundation/domain';
import type {
  AssessmentReadRepository,
  AssessmentWriteRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

const createAssessmentDefinitionSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

const createAssessmentVersionSchema = z.object({
  assessmentDefinitionId: z.string().uuid(),
  scoringVersion: z.string().min(1),
});

const cloneVersionSchema = z.object({
  sourceVersionId: z.string().uuid(),
  scoringVersion: z.string().min(1),
});

export interface PublishAssessmentVersionResult {
  published: boolean;
  validation: AssessmentVersionValidationResult;
  assessmentVersion: Awaited<ReturnType<AssessmentWriteRepository['publishAssessmentVersion']>> | null;
}

export const createAssessmentDefinition = async (
  deps: { assessmentWriteRepository: AssessmentWriteRepository },
  input: { key: string; name: string; description?: string },
) => {
  return deps.assessmentWriteRepository.createAssessmentDefinition(
    createAssessmentDefinitionSchema.parse(input),
  );
};

export const createAssessmentVersion = async (
  deps: { assessmentWriteRepository: AssessmentWriteRepository },
  input: { assessmentDefinitionId: UUID; scoringVersion: string },
) => {
  return deps.assessmentWriteRepository.createAssessmentVersionDraft(
    createAssessmentVersionSchema.parse(input),
  );
};

export const cloneAssessmentVersion = async (
  deps: { assessmentWriteRepository: AssessmentWriteRepository },
  input: { sourceVersionId: UUID; scoringVersion: string },
) => {
  return deps.assessmentWriteRepository.cloneAssessmentVersion(cloneVersionSchema.parse(input));
};

export const validateAssessmentVersion = async (
  deps: { assessmentReadRepository: AssessmentReadRepository },
  versionId: UUID,
): Promise<AssessmentVersionValidationResult> => {
  const version = await deps.assessmentReadRepository.getVersion(versionId);
  if (!version) {
    throw new Error('Assessment version not found');
  }

  return validateAssessmentVersionForPublish(version);
};

export const publishAssessmentVersion = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  versionId: UUID,
): Promise<PublishAssessmentVersionResult> => {
  const version = await deps.assessmentReadRepository.getVersion(versionId);
  if (!version) {
    throw new Error('Assessment version not found');
  }

  const validation = validateAssessmentVersionForPublish(version);

  if (!validation.isPublishable) {
    return {
      published: false,
      validation,
      assessmentVersion: null,
    };
  }

  // TODO: Future admin/auth layer should verify publish permissions before this call.
  const publishedVersion = await deps.assessmentWriteRepository.publishAssessmentVersion(versionId);

  return {
    published: true,
    validation,
    assessmentVersion: publishedVersion,
  };
};

export const getAssessmentVersionById = async (
  deps: { assessmentReadRepository: AssessmentReadRepository },
  versionId: UUID,
) => {
  return deps.assessmentReadRepository.getVersion(versionId);
};

export const getActiveAssessmentVersion = async (
  deps: { assessmentReadRepository: AssessmentReadRepository },
  assessmentDefinitionId: UUID,
) => {
  return deps.assessmentReadRepository.getActivePublishedVersion(assessmentDefinitionId);
};
