import { Prisma } from '@prisma/client';
import type { CandidateItemRepository } from '@disc-foundation/application';
import type {
  CandidateItem,
  CandidateItemReview,
  CandidateItemSimilarityMatch,
  ContextApplicability,
} from '@disc-foundation/domain';
import type { UUID } from '@disc-foundation/shared';
import { prisma } from '../services/prisma.js';
import { getAccessContext } from '../services/access-context.js';

const getTenantId = (): string => getAccessContext().tenantId;

const normalizePrompt = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string): Set<string> =>
  new Set(normalizePrompt(value).split(' ').filter((token) => token.length > 2));

const jaccardSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};

const DISC_OPTION_SET = [
  { code: 'strongly_disagree', label: 'Strongly disagree', order: 1, intensity: 0 },
  { code: 'disagree', label: 'Disagree', order: 2, intensity: 1 },
  { code: 'neutral', label: 'Neither agree nor disagree', order: 3, intensity: 2 },
  { code: 'agree', label: 'Agree', order: 4, intensity: 3 },
  { code: 'strongly_agree', label: 'Strongly agree', order: 5, intensity: 4 },
] as const;

const DIRECTION_TO_DIMENSION: Record<CandidateItem['axisDirection'], string> = {
  highTempo: 'D',
  lowTempo: 'S',
  taskFocus: 'C',
  peopleFocus: 'I',
};

const toCandidateItem = (record: {
  id: string;
  assessmentDefinitionId: string;
  prompt: string;
  axis: CandidateItem['axis'];
  axisDirection: CandidateItem['axisDirection'];
  weight: number;
  reverseKeyed: boolean;
  role: CandidateItem['role'];
  mirrorCandidateItemId: string | null;
  contextApplicability: string[];
  disambiguationTags: string[];
  uncertaintyProfile: string | null;
  aiGenerated: boolean;
  aiModel: string | null;
  aiPromptVersion: string | null;
  aiRationale: string | null;
  aiConfidence: number | null;
  aiSuggestedAlternatives: string[];
  createdAt: Date;
  updatedAt: Date;
  promotedAt: Date | null;
  promotedAssessmentVersionId: string | null;
  promotedQuestionId: string | null;
}): CandidateItem => ({
  id: record.id,
  assessmentDefinitionId: record.assessmentDefinitionId,
  prompt: record.prompt,
  axis: record.axis,
  axisDirection: record.axisDirection,
  weight: record.weight,
  reverseKeyed: record.reverseKeyed,
  role: record.role,
  ...(record.mirrorCandidateItemId ? { mirrorCandidateItemId: record.mirrorCandidateItemId } : {}),
  contextApplicability: record.contextApplicability as ContextApplicability[],
  disambiguationTags: record.disambiguationTags,
  ...(record.uncertaintyProfile ? { uncertaintyProfile: record.uncertaintyProfile } : {}),
  aiMetadata: {
    aiGenerated: record.aiGenerated,
    ...(record.aiModel ? { aiModel: record.aiModel } : {}),
    ...(record.aiPromptVersion ? { aiPromptVersion: record.aiPromptVersion } : {}),
    ...(record.aiRationale ? { aiRationale: record.aiRationale } : {}),
    ...(record.aiConfidence !== null ? { aiConfidence: record.aiConfidence } : {}),
    ...(record.aiSuggestedAlternatives.length > 0
      ? { aiSuggestedAlternatives: record.aiSuggestedAlternatives }
      : {}),
  },
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  ...(record.promotedAt ? { promotedAt: record.promotedAt } : {}),
  ...(record.promotedAssessmentVersionId
    ? { promotedAssessmentVersionId: record.promotedAssessmentVersionId }
    : {}),
  ...(record.promotedQuestionId ? { promotedQuestionId: record.promotedQuestionId } : {}),
});

const toCandidateItemReview = (record: {
  id: string;
  candidateItemId: string;
  clarityScore: number;
  ambiguityRisk: number;
  doubleBarreledRisk: number;
  socialDesirabilityRisk: number;
  discriminationPotential: number;
  mirrorUsefulness: number;
  overlapRisk: number;
  reviewerNotes: string | null;
  status: CandidateItemReview['status'];
  nearDuplicateQuestionIds: string[];
  createdAt: Date;
}): CandidateItemReview => ({
  id: record.id,
  candidateItemId: record.candidateItemId,
  clarityScore: record.clarityScore,
  ambiguityRisk: record.ambiguityRisk,
  doubleBarreledRisk: record.doubleBarreledRisk,
  socialDesirabilityRisk: record.socialDesirabilityRisk,
  discriminationPotential: record.discriminationPotential,
  mirrorUsefulness: record.mirrorUsefulness,
  overlapRisk: record.overlapRisk,
  ...(record.reviewerNotes ? { reviewerNotes: record.reviewerNotes } : {}),
  status: record.status,
  nearDuplicateQuestionIds: record.nearDuplicateQuestionIds,
  createdAt: record.createdAt,
});

export class PrismaCandidateItemRepository implements CandidateItemRepository {
  async createCandidateItem(input: {
    assessmentDefinitionId: UUID;
    prompt: string;
    axis: CandidateItem['axis'];
    axisDirection: CandidateItem['axisDirection'];
    weight: number;
    reverseKeyed: boolean;
    role: CandidateItem['role'];
    mirrorCandidateItemId?: UUID;
    contextApplicability: ContextApplicability[];
    disambiguationTags?: string[];
    uncertaintyProfile?: string;
    aiGenerated: boolean;
    aiModel?: string;
    aiPromptVersion?: string;
    aiRationale?: string;
    aiConfidence?: number;
    aiSuggestedAlternatives?: string[];
  }): Promise<CandidateItem> {
    const tenantId = getTenantId();

    const assessment = await prisma.assessmentDefinition.findFirst({
      where: { id: input.assessmentDefinitionId, tenantId },
      select: { id: true },
    });
    if (!assessment) throw new Error('Assessment definition not found');

    if (input.mirrorCandidateItemId) {
      const mirrorRef = await prisma.candidateItem.findFirst({
        where: {
          id: input.mirrorCandidateItemId,
          tenantId,
          assessmentDefinitionId: input.assessmentDefinitionId,
        },
        select: { id: true },
      });
      if (!mirrorRef) throw new Error('Mirror candidate item reference not found');
    }

    const created = await prisma.candidateItem.create({
      data: {
        tenantId,
        assessmentDefinitionId: input.assessmentDefinitionId,
        prompt: input.prompt,
        axis: input.axis,
        axisDirection: input.axisDirection,
        weight: input.weight,
        reverseKeyed: input.reverseKeyed,
        role: input.role,
        mirrorCandidateItemId: input.mirrorCandidateItemId,
        contextApplicability: input.contextApplicability,
        disambiguationTags: input.disambiguationTags ?? [],
        uncertaintyProfile: input.uncertaintyProfile,
        aiGenerated: input.aiGenerated,
        aiModel: input.aiModel,
        aiPromptVersion: input.aiPromptVersion,
        aiRationale: input.aiRationale,
        aiConfidence: input.aiConfidence,
        aiSuggestedAlternatives: input.aiSuggestedAlternatives ?? [],
      },
    });

    return toCandidateItem(created);
  }

  async listCandidateItems(input: {
    assessmentDefinitionId: UUID;
    status?: CandidateItemReview['status'];
    includePromoted?: boolean;
  }): Promise<Array<CandidateItem & { latestReview?: CandidateItemReview }>> {
    const tenantId = getTenantId();

    const items = await prisma.candidateItem.findMany({
      where: {
        tenantId,
        assessmentDefinitionId: input.assessmentDefinitionId,
        ...(input.includePromoted ? {} : { promotedAt: null }),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: input.status ? 5 : 1,
        },
      },
    });

    return items
      .map((item) => {
        const latestReview = item.reviews[0] ? toCandidateItemReview(item.reviews[0]) : undefined;
        return {
          ...toCandidateItem(item),
          ...(latestReview ? { latestReview } : {}),
        };
      })
      .filter((item) => (input.status ? item.latestReview?.status === input.status : true));
  }

  async createCandidateItemReview(input: {
    candidateItemId: UUID;
    clarityScore: number;
    ambiguityRisk: number;
    doubleBarreledRisk: number;
    socialDesirabilityRisk: number;
    discriminationPotential: number;
    mirrorUsefulness: number;
    overlapRisk: number;
    reviewerNotes?: string;
    status: CandidateItemReview['status'];
    nearDuplicateQuestionIds?: UUID[];
  }): Promise<CandidateItemReview> {
    const tenantId = getTenantId();
    const candidate = await prisma.candidateItem.findFirst({
      where: { id: input.candidateItemId, tenantId },
      select: { id: true, promotedAt: true },
    });
    if (!candidate) throw new Error('Candidate item not found');
    if (candidate.promotedAt) throw new Error('Promoted candidate items are immutable');

    const created = await prisma.candidateItemReview.create({
      data: {
        tenantId,
        candidateItemId: input.candidateItemId,
        clarityScore: input.clarityScore,
        ambiguityRisk: input.ambiguityRisk,
        doubleBarreledRisk: input.doubleBarreledRisk,
        socialDesirabilityRisk: input.socialDesirabilityRisk,
        discriminationPotential: input.discriminationPotential,
        mirrorUsefulness: input.mirrorUsefulness,
        overlapRisk: input.overlapRisk,
        reviewerNotes: input.reviewerNotes,
        status: input.status,
        nearDuplicateQuestionIds: input.nearDuplicateQuestionIds ?? [],
      },
    });

    return toCandidateItemReview(created);
  }

  async getLatestCandidateItemReview(candidateItemId: UUID): Promise<CandidateItemReview | null> {
    const tenantId = getTenantId();
    const record = await prisma.candidateItemReview.findFirst({
      where: { tenantId, candidateItemId },
      orderBy: { createdAt: 'desc' },
    });

    return record ? toCandidateItemReview(record) : null;
  }

  async findSimilarItems(input: {
    assessmentDefinitionId: UUID;
    prompt: string;
    threshold?: number;
    limit?: number;
  }): Promise<CandidateItemSimilarityMatch[]> {
    const tenantId = getTenantId();
    const threshold = input.threshold ?? 0.6;
    const limit = input.limit ?? 10;

    const existingQuestions = await prisma.question.findMany({
      where: {
        assessmentVersion: {
          tenantId,
          assessmentDefinitionId: input.assessmentDefinitionId,
        },
      },
      select: {
        id: true,
        code: true,
        prompt: true,
      },
    });

    const promptTokens = tokenize(input.prompt);

    return existingQuestions
      .map((question) => {
        const similarityScore = jaccardSimilarity(promptTokens, tokenize(question.prompt));
        return {
          questionId: question.id,
          questionCode: question.code,
          prompt: question.prompt,
          similarityScore,
          nearDuplicate: similarityScore >= 0.8,
        };
      })
      .filter((entry) => entry.similarityScore >= threshold)
      .sort((left, right) => right.similarityScore - left.similarityScore)
      .slice(0, limit);
  }

  async promoteApprovedCandidates(input: {
    assessmentVersionId: UUID;
    candidateItemIds: UUID[];
  }): Promise<
    Array<{
      candidateItemId: UUID;
      questionId: UUID;
      questionCode: string;
    }>
  > {
    const tenantId = getTenantId();
    if (input.candidateItemIds.length === 0) {
      return [];
    }

    return prisma.$transaction(async (tx) => {
      const version = await tx.assessmentVersion.findFirst({
        where: { id: input.assessmentVersionId, tenantId },
        select: { id: true, status: true, immutableAt: true, assessmentDefinitionId: true },
      });
      if (!version) throw new Error('Assessment version not found');
      if (version.status !== 'draft' || version.immutableAt) {
        throw new Error('Candidate items can only be promoted into mutable draft versions');
      }

      const candidates = await tx.candidateItem.findMany({
        where: {
          id: { in: input.candidateItemIds },
          tenantId,
          assessmentDefinitionId: version.assessmentDefinitionId,
        },
        include: {
          reviews: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (candidates.length !== input.candidateItemIds.length) {
        throw new Error('One or more candidate items were not found for this assessment definition');
      }

      const dimensions = await tx.scoreDimension.findMany({
        where: { assessmentVersionId: version.id },
        select: { key: true },
      });
      const dimensionKeys = new Set(dimensions.map((dimension) => dimension.key));

      const existingQuestions = await tx.question.findMany({
        where: { assessmentVersionId: version.id },
        select: { code: true, order: true },
      });
      let counter = existingQuestions.length + 1;
      let nextOrder = existingQuestions.reduce((max, question) => Math.max(max, question.order), 0) + 1;
      const nextCode = (): string => {
        while (existingQuestions.some((entry) => entry.code === `CI${counter}`)) {
          counter += 1;
        }
        const code = `CI${counter}`;
        counter += 1;
        return code;
      };

      const now = new Date();
      const promoted: Array<{ candidateItemId: UUID; questionId: UUID; questionCode: string }> = [];

      for (const candidate of candidates) {
        if (candidate.promotedAt) {
          throw new Error(`Candidate item already promoted: ${candidate.id}`);
        }

        const latestReview = candidate.reviews[0];
        if (!latestReview || latestReview.status !== 'approved') {
          throw new Error(`Candidate item is not approved for promotion: ${candidate.id}`);
        }

        const targetDimension = DIRECTION_TO_DIMENSION[candidate.axisDirection];
        if (!dimensionKeys.has(targetDimension)) {
          throw new Error(`Missing score dimension ${targetDimension} required for candidate promotion`);
        }

        const questionCode = nextCode();
        const question = await tx.question.create({
          data: {
            assessmentVersionId: version.id,
            code: questionCode,
            prompt: candidate.prompt,
            type: 'single_choice',
            order: nextOrder,
            required: true,
            metadata: {
              axis: candidate.axis,
              axisDirection: candidate.axisDirection,
              weight: candidate.weight,
              reverseKeyed: candidate.reverseKeyed,
              role: candidate.role,
              contextApplicability: candidate.contextApplicability,
              disambiguationTags: candidate.disambiguationTags,
              ...(candidate.mirrorCandidateItemId
                ? { mirrorCandidateItemId: candidate.mirrorCandidateItemId }
                : {}),
              ...(candidate.uncertaintyProfile
                ? { uncertaintyProfile: candidate.uncertaintyProfile }
                : {}),
              sourceCandidateItemId: candidate.id,
              aiMetadata: {
                aiGenerated: candidate.aiGenerated,
                aiModel: candidate.aiModel,
                aiPromptVersion: candidate.aiPromptVersion,
                aiRationale: candidate.aiRationale,
                aiConfidence: candidate.aiConfidence,
                aiSuggestedAlternatives: candidate.aiSuggestedAlternatives,
              },
            } satisfies Prisma.InputJsonValue,
          },
        });

        for (const option of DISC_OPTION_SET) {
          const createdOption = await tx.questionOption.create({
            data: {
              questionId: question.id,
              code: option.code,
              label: option.label,
              order: option.order,
              metadata: {
                intensity: option.intensity,
              } satisfies Prisma.InputJsonValue,
            },
          });

          const alignedValue = candidate.reverseKeyed ? 4 - option.intensity : option.intensity;
          await tx.scoringRule.create({
            data: {
              assessmentVersionId: version.id,
              questionId: question.id,
              optionId: createdOption.id,
              impacts: [
                {
                  dimensionKey: targetDimension,
                  weight: alignedValue * candidate.weight,
                },
              ] satisfies Prisma.InputJsonValue,
            },
          });
        }

        await tx.candidateItem.update({
          where: { id: candidate.id },
          data: {
            promotedAt: now,
            promotedAssessmentVersionId: version.id,
            promotedQuestionId: question.id,
          },
        });

        promoted.push({ candidateItemId: candidate.id, questionId: question.id, questionCode });
        nextOrder += 1;
      }

      await tx.assessmentVersion.update({
        where: { id: version.id },
        data: { questionCount: { increment: promoted.length } },
      });

      return promoted;
    });
  }
}
