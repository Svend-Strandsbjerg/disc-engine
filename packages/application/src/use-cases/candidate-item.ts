import { z } from 'zod';
import type {
  AssessmentReadRepository,
  CandidateItemRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

const candidateItemSchema = z.object({
  assessmentDefinitionId: z.string().uuid(),
  prompt: z.string().min(5),
  axis: z.enum(['tempo', 'focus']),
  axisDirection: z.enum(['highTempo', 'lowTempo', 'taskFocus', 'peopleFocus']),
  weight: z.number().positive(),
  reverseKeyed: z.boolean(),
  role: z.enum(['core', 'mirror', 'tiebreaker']),
  mirrorCandidateItemId: z.string().uuid().optional(),
  contextApplicability: z.array(z.enum(['work', 'private', 'generic'])).min(1),
  disambiguationTags: z.array(z.string().min(1)).default([]),
  uncertaintyProfile: z.string().min(1).optional(),
  aiGenerated: z.boolean().default(false),
  aiModel: z.string().min(1).optional(),
  aiPromptVersion: z.string().min(1).optional(),
  aiRationale: z.string().min(1).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  aiSuggestedAlternatives: z.array(z.string().min(1)).optional(),
});

const reviewSchema = z.object({
  candidateItemId: z.string().uuid(),
  clarityScore: z.number().min(0).max(1),
  ambiguityRisk: z.number().min(0).max(1),
  doubleBarreledRisk: z.number().min(0).max(1),
  socialDesirabilityRisk: z.number().min(0).max(1),
  discriminationPotential: z.number().min(0).max(1),
  mirrorUsefulness: z.number().min(0).max(1),
  overlapRisk: z.number().min(0).max(1),
  reviewerNotes: z.string().optional(),
  status: z.enum(['candidate', 'needs_revision', 'approved', 'rejected']),
  nearDuplicateQuestionIds: z.array(z.string().uuid()).optional(),
});

export const createCandidateItem = async (
  deps: { candidateItemRepository: CandidateItemRepository },
  input: z.input<typeof candidateItemSchema>,
) => {
  const parsed = candidateItemSchema.parse(input);
  if (parsed.role === 'mirror' && !parsed.mirrorCandidateItemId) {
    throw new Error('Mirror candidate items must reference a paired candidate item');
  }

  return deps.candidateItemRepository.createCandidateItem({
    assessmentDefinitionId: parsed.assessmentDefinitionId,
    prompt: parsed.prompt,
    axis: parsed.axis,
    axisDirection: parsed.axisDirection,
    weight: parsed.weight,
    reverseKeyed: parsed.reverseKeyed,
    role: parsed.role,
    contextApplicability: parsed.contextApplicability,
    disambiguationTags: parsed.disambiguationTags,
    aiGenerated: parsed.aiGenerated,
    ...(parsed.mirrorCandidateItemId !== undefined
      ? { mirrorCandidateItemId: parsed.mirrorCandidateItemId }
      : {}),
    ...(parsed.uncertaintyProfile !== undefined
      ? { uncertaintyProfile: parsed.uncertaintyProfile }
      : {}),
    ...(parsed.aiModel !== undefined ? { aiModel: parsed.aiModel } : {}),
    ...(parsed.aiPromptVersion !== undefined ? { aiPromptVersion: parsed.aiPromptVersion } : {}),
    ...(parsed.aiRationale !== undefined ? { aiRationale: parsed.aiRationale } : {}),
    ...(parsed.aiConfidence !== undefined ? { aiConfidence: parsed.aiConfidence } : {}),
    ...(parsed.aiSuggestedAlternatives !== undefined
      ? { aiSuggestedAlternatives: parsed.aiSuggestedAlternatives }
      : {}),
  });
};

export const listCandidateItems = async (
  deps: { candidateItemRepository: CandidateItemRepository },
  input: {
    assessmentDefinitionId: UUID;
    status?: 'candidate' | 'needs_revision' | 'approved' | 'rejected';
    includePromoted?: boolean;
  },
) => {
  return deps.candidateItemRepository.listCandidateItems(input);
};

export const reviewCandidateItem = async (
  deps: { candidateItemRepository: CandidateItemRepository },
  input: z.input<typeof reviewSchema>,
) => {
  const parsed = reviewSchema.parse(input);

  return deps.candidateItemRepository.createCandidateItemReview({
    candidateItemId: parsed.candidateItemId,
    clarityScore: parsed.clarityScore,
    ambiguityRisk: parsed.ambiguityRisk,
    doubleBarreledRisk: parsed.doubleBarreledRisk,
    socialDesirabilityRisk: parsed.socialDesirabilityRisk,
    discriminationPotential: parsed.discriminationPotential,
    mirrorUsefulness: parsed.mirrorUsefulness,
    overlapRisk: parsed.overlapRisk,
    status: parsed.status,
    ...(parsed.reviewerNotes !== undefined ? { reviewerNotes: parsed.reviewerNotes } : {}),
    ...(parsed.nearDuplicateQuestionIds !== undefined
      ? { nearDuplicateQuestionIds: parsed.nearDuplicateQuestionIds }
      : {}),
  });
};

export const compareCandidateItemSimilarity = async (
  deps: { candidateItemRepository: CandidateItemRepository },
  input: { assessmentDefinitionId: UUID; prompt: string; threshold?: number; limit?: number },
) => {
  return deps.candidateItemRepository.findSimilarItems(input);
};

export const promoteCandidateItemsToDraftVersion = async (
  deps: {
    candidateItemRepository: CandidateItemRepository;
    assessmentReadRepository: AssessmentReadRepository;
  },
  input: { assessmentVersionId: UUID; candidateItemIds: UUID[] },
) => {
  const version = await deps.assessmentReadRepository.getVersion(input.assessmentVersionId);
  if (!version) {
    throw new Error('Assessment version not found');
  }

  if (version.status !== 'draft') {
    throw new Error('Candidate item promotion is only allowed for draft versions');
  }

  return deps.candidateItemRepository.promoteApprovedCandidates({
    assessmentVersionId: input.assessmentVersionId,
    candidateItemIds: input.candidateItemIds,
  });
};
