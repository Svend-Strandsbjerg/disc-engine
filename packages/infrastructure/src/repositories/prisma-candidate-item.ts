import { Prisma } from '@prisma/client';
import type { CandidateItemRepository } from '@disc-foundation/application';
import type {
  CandidateItem,
  CandidateItemIntakeMetadata,
  CandidateItemGenerationBatch,
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

const fromPrismaCandidateItemIntakeMetadata = (
  value: Prisma.JsonValue | null,
): CandidateItemIntakeMetadata | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const duplicateMatches = raw.duplicateMatches;
  if (!Array.isArray(duplicateMatches)) return undefined;

  const mappedDuplicateMatches = duplicateMatches
    .map((match) => {
      if (!match || typeof match !== 'object' || Array.isArray(match)) return undefined;
      const rawMatch = match as Record<string, unknown>;
      if (
        (rawMatch.source !== 'candidate_item' && rawMatch.source !== 'promoted_question') ||
        typeof rawMatch.sourceId !== 'string' ||
        typeof rawMatch.sourcePrompt !== 'string' ||
        typeof rawMatch.similarityScore !== 'number' ||
        typeof rawMatch.obviousDuplicate !== 'boolean'
      ) {
        return undefined;
      }
      return {
        source: rawMatch.source,
        sourceId: rawMatch.sourceId,
        sourcePrompt: rawMatch.sourcePrompt,
        similarityScore: rawMatch.similarityScore,
        obviousDuplicate: rawMatch.obviousDuplicate,
      };
    })
    .filter((match): match is CandidateItemIntakeMetadata['duplicateMatches'][number] => !!match);

  if (
    mappedDuplicateMatches.length !== duplicateMatches.length ||
    typeof raw.normalizationVersion !== 'string' ||
    typeof raw.duplicateScreeningVersion !== 'string' ||
    typeof raw.likelyDuplicate !== 'boolean' ||
    typeof raw.obviousDuplicate !== 'boolean'
  ) {
    return undefined;
  }

  return {
    normalizationVersion: raw.normalizationVersion,
    duplicateScreeningVersion: raw.duplicateScreeningVersion,
    likelyDuplicate: raw.likelyDuplicate,
    obviousDuplicate: raw.obviousDuplicate,
    duplicateMatches: mappedDuplicateMatches,
  };
};

const toPrismaCandidateItemIntakeMetadata = (
  value: CandidateItemIntakeMetadata | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =>
  value
    ? ({
        normalizationVersion: value.normalizationVersion,
        duplicateScreeningVersion: value.duplicateScreeningVersion,
        likelyDuplicate: value.likelyDuplicate,
        obviousDuplicate: value.obviousDuplicate,
        duplicateMatches: value.duplicateMatches.map((match) => ({
          source: match.source,
          sourceId: match.sourceId,
          sourcePrompt: match.sourcePrompt,
          similarityScore: match.similarityScore,
          obviousDuplicate: match.obviousDuplicate,
        })),
      } satisfies Prisma.InputJsonValue)
    : Prisma.JsonNull;

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
  adaptiveEligible: boolean;
  itemPoolGroupIds: string[];
  routingTags: string[];
  uncertaintyTargetAreas: string[];
  calibration: Prisma.JsonValue | null;
  aiGenerated: boolean;
  aiModel: string | null;
  aiPromptVersion: string | null;
  aiRationale: string | null;
  aiConfidence: number | null;
  aiSuggestedAlternatives: string[];
  generationBatchId: string | null;
  intakeMetadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  promotedAt: Date | null;
  promotedAssessmentVersionId: string | null;
  promotedQuestionId: string | null;
}): CandidateItem => {
  const intakeMetadata = fromPrismaCandidateItemIntakeMetadata(record.intakeMetadata);

  return {
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
    adaptiveEligible: record.adaptiveEligible,
    itemPoolGroupIds: record.itemPoolGroupIds,
    routingTags: record.routingTags,
    uncertaintyTargetAreas: record.uncertaintyTargetAreas,
    ...(record.calibration &&
    typeof record.calibration === 'object' &&
    !Array.isArray(record.calibration)
      ? {
          calibration: record.calibration as NonNullable<CandidateItem['calibration']>,
        }
      : {}),
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
    ...(record.generationBatchId ? { generationBatchId: record.generationBatchId } : {}),
    ...(intakeMetadata ? { intakeMetadata } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.promotedAt ? { promotedAt: record.promotedAt } : {}),
    ...(record.promotedAssessmentVersionId
      ? { promotedAssessmentVersionId: record.promotedAssessmentVersionId }
      : {}),
    ...(record.promotedQuestionId ? { promotedQuestionId: record.promotedQuestionId } : {}),
  };
};

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

const toGenerationBatch = (record: {
  id: string;
  generationId: string;
  createdAt: Date;
  sourceType: CandidateItemGenerationBatch['sourceType'];
  modelName: string;
  promptVersion: string;
  targetAssessmentDefinitionId: string;
  context: string | null;
  rationaleNotes: string | null;
  normalizationVersion: string;
}): CandidateItemGenerationBatch => ({
  id: record.id,
  generationId: record.generationId,
  createdAt: record.createdAt,
  sourceType: record.sourceType,
  modelName: record.modelName,
  promptVersion: record.promptVersion,
  targetAssessmentDefinitionId: record.targetAssessmentDefinitionId,
  ...(record.context ? { context: record.context as ContextApplicability } : {}),
  ...(record.rationaleNotes ? { rationaleNotes: record.rationaleNotes } : {}),
  normalizationVersion: record.normalizationVersion,
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
    adaptiveEligible?: boolean;
    itemPoolGroupIds?: string[];
    routingTags?: string[];
    uncertaintyTargetAreas?: string[];
    calibration?: {
      informationValue?: number;
      discrimination?: number;
      difficulty?: number;
    };
    aiGenerated: boolean;
    aiModel?: string;
    aiPromptVersion?: string;
    aiRationale?: string;
    aiConfidence?: number;
    aiSuggestedAlternatives?: string[];
    generationBatchId?: UUID;
    intakeMetadata?: CandidateItemIntakeMetadata;
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
        mirrorCandidateItemId: input.mirrorCandidateItemId ?? null,
        contextApplicability: input.contextApplicability,
        disambiguationTags: input.disambiguationTags ?? [],
        uncertaintyProfile: input.uncertaintyProfile ?? null,
        adaptiveEligible: input.adaptiveEligible ?? false,
        itemPoolGroupIds: input.itemPoolGroupIds ?? [],
        routingTags: input.routingTags ?? [],
        uncertaintyTargetAreas: input.uncertaintyTargetAreas ?? [],
        calibration: input.calibration ? (input.calibration as Prisma.InputJsonValue) : Prisma.JsonNull,
        aiGenerated: input.aiGenerated,
        aiModel: input.aiModel ?? null,
        aiPromptVersion: input.aiPromptVersion ?? null,
        aiRationale: input.aiRationale ?? null,
        aiConfidence: input.aiConfidence ?? null,
        aiSuggestedAlternatives: input.aiSuggestedAlternatives ?? [],
        generationBatchId: input.generationBatchId ?? null,
        intakeMetadata: toPrismaCandidateItemIntakeMetadata(input.intakeMetadata),
      },
    });

    return toCandidateItem(created);
  }

  async createGenerationBatch(input: {
    generationId: string;
    sourceType: CandidateItemGenerationBatch['sourceType'];
    modelName: string;
    promptVersion: string;
    targetAssessmentDefinitionId: UUID;
    context?: ContextApplicability;
    rationaleNotes?: string;
    normalizationVersion: string;
  }): Promise<CandidateItemGenerationBatch> {
    const tenantId = getTenantId();
    const assessment = await prisma.assessmentDefinition.findFirst({
      where: { id: input.targetAssessmentDefinitionId, tenantId },
      select: { id: true },
    });
    if (!assessment) throw new Error('Assessment definition not found');

    const created = await prisma.candidateItemGenerationBatch.create({
      data: {
        tenantId,
        generationId: input.generationId,
        sourceType: input.sourceType,
        modelName: input.modelName,
        promptVersion: input.promptVersion,
        targetAssessmentDefinitionId: input.targetAssessmentDefinitionId,
        context: input.context ?? null,
        rationaleNotes: input.rationaleNotes ?? null,
        normalizationVersion: input.normalizationVersion,
      },
    });

    return toGenerationBatch(created);
  }

  async getDuplicateScreeningCorpus(input: { assessmentDefinitionId: UUID }): Promise<{
    candidateItems: Array<{ id: UUID; prompt: string }>;
    promotedQuestions: Array<{ id: UUID; prompt: string }>;
  }> {
    const tenantId = getTenantId();
    const [candidateItems, promotedQuestions] = await Promise.all([
      prisma.candidateItem.findMany({
        where: {
          tenantId,
          assessmentDefinitionId: input.assessmentDefinitionId,
        },
        select: { id: true, prompt: true },
      }),
      prisma.question.findMany({
        where: {
          assessmentVersion: {
            tenantId,
            assessmentDefinitionId: input.assessmentDefinitionId,
          },
        },
        select: { id: true, prompt: true },
      }),
    ]);

    return { candidateItems, promotedQuestions };
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
        reviewerNotes: input.reviewerNotes ?? null,
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
