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
  productLine: z.string().min(2).default('disc'),
});

const createAssessmentVersionSchema = z.object({
  assessmentDefinitionId: z.string().uuid(),
  scoringVersion: z.string().min(1),
  metadata: z.object({
    assessmentVersionKey: z.string().min(3),
    tier: z.enum(['free', 'standard', 'deep']),
    intendedUse: z.string().min(3),
    contextFrame: z.string().min(3).optional(),
    expectedItemCount: z.number().int().positive(),
    expectedCompletionTimeMinutes: z.number().int().positive(),
    form: z.enum(['fixed_form', 'future_adaptive_ready']),
    adaptive: z.object({
      adaptiveEligible: z.boolean(),
      itemPoolGroupIds: z.array(z.string().min(1)).default([]),
      uncertaintyTargetAreas: z.array(z.string().min(1)).default([]),
      routingTags: z.array(z.string().min(1)).default([]),
    }),
  }),
});

const cloneVersionSchema = z.object({
  sourceVersionId: z.string().uuid(),
  scoringVersion: z.string().min(1),
  metadata: createAssessmentVersionSchema.shape.metadata.optional(),
});

export interface PublishAssessmentVersionResult {
  published: boolean;
  validation: AssessmentVersionValidationResult;
  assessmentVersion: Awaited<ReturnType<AssessmentWriteRepository['publishAssessmentVersion']>> | null;
}

export const createAssessmentDefinition = async (
  deps: { assessmentWriteRepository: AssessmentWriteRepository },
  input: { key: string; name: string; description?: string; productLine?: string },
) => {
  const parsed = createAssessmentDefinitionSchema.parse(input);
  return deps.assessmentWriteRepository.createAssessmentDefinition({
    key: parsed.key,
    name: parsed.name,
    productLine: parsed.productLine,
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
  });
};

export const createAssessmentVersion = async (
  deps: { assessmentWriteRepository: AssessmentWriteRepository },
  input: {
    assessmentDefinitionId: UUID;
    scoringVersion: string;
    metadata: z.input<typeof createAssessmentVersionSchema>['metadata'];
  },
) => {
  return deps.assessmentWriteRepository.createAssessmentVersionDraft(
    createAssessmentVersionSchema.parse(input),
  );
};

export const cloneAssessmentVersion = async (
  deps: { assessmentWriteRepository: AssessmentWriteRepository },
  input: {
    sourceVersionId: UUID;
    scoringVersion: string;
    metadata?: z.input<typeof cloneVersionSchema>['metadata'];
  },
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
