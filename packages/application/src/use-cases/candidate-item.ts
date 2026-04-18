import { z } from 'zod';
import type {
  AssessmentReadRepository,
  CandidateItemRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

const ITEM_INTAKE_NORMALIZATION_VERSION = 'candidate-intake-v1';
const ITEM_DUPLICATE_SCREENING_VERSION = 'candidate-duplicate-v1';

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
  adaptiveEligible: z.boolean().default(false),
  itemPoolGroupIds: z.array(z.string().min(1)).default([]),
  routingTags: z.array(z.string().min(1)).default([]),
  uncertaintyTargetAreas: z.array(z.string().min(1)).default([]),
  calibration: z
    .object({
      informationValue: z.number().optional(),
      discrimination: z.number().optional(),
      difficulty: z.number().optional(),
    })
    .optional(),
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
  const calibration = parsed.calibration
    ? {
        ...(parsed.calibration.informationValue !== undefined
          ? { informationValue: parsed.calibration.informationValue }
          : {}),
        ...(parsed.calibration.discrimination !== undefined
          ? { discrimination: parsed.calibration.discrimination }
          : {}),
        ...(parsed.calibration.difficulty !== undefined
          ? { difficulty: parsed.calibration.difficulty }
          : {}),
      }
    : undefined;
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
    adaptiveEligible: parsed.adaptiveEligible,
    itemPoolGroupIds: parsed.itemPoolGroupIds,
    routingTags: parsed.routingTags,
    uncertaintyTargetAreas: parsed.uncertaintyTargetAreas,
    aiGenerated: parsed.aiGenerated,
    ...(parsed.mirrorCandidateItemId !== undefined
      ? { mirrorCandidateItemId: parsed.mirrorCandidateItemId }
      : {}),
    ...(parsed.uncertaintyProfile !== undefined
      ? { uncertaintyProfile: parsed.uncertaintyProfile }
      : {}),
    ...(calibration !== undefined && Object.keys(calibration).length > 0 ? { calibration } : {}),
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

const generationBatchSchema = z.object({
  generationId: z.string().min(1),
  sourceType: z.enum(['ai_assistant', 'human_seeded', 'bulk_import', 'other']),
  modelName: z.string().min(1),
  promptVersion: z.string().min(1),
  targetAssessmentDefinitionId: z.string().uuid(),
  context: z.enum(['work', 'private', 'generic']).optional(),
  rationaleNotes: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        prompt: z.string().min(5),
        axis: z.enum(['tempo', 'focus']),
        axisDirection: z.enum(['highTempo', 'lowTempo', 'taskFocus', 'peopleFocus']),
        weight: z.number().positive().max(5),
        reverseKeyed: z.boolean().default(false),
        role: z.enum(['core', 'mirror', 'tiebreaker']),
        mirrorReferenceKey: z.string().min(1).optional(),
        contextApplicability: z.array(z.enum(['work', 'private', 'generic'])).min(1),
        disambiguationTags: z.array(z.string().min(1)).default([]),
        uncertaintyProfile: z.string().min(1).optional(),
        adaptiveEligible: z.boolean().default(true),
        itemPoolGroupIds: z.array(z.string().min(1)).default([]),
        routingTags: z.array(z.string().min(1)).default([]),
        uncertaintyTargetAreas: z.array(z.string().min(1)).default([]),
        calibration: z
          .object({
            informationValue: z.number().optional(),
            discrimination: z.number().optional(),
            difficulty: z.number().optional(),
          })
          .optional(),
        aiGenerated: z.boolean().default(true),
        aiModel: z.string().min(1),
        aiPromptVersion: z.string().min(1),
        aiRationale: z.string().min(1).optional(),
        aiConfidence: z.number().min(0).max(1).optional(),
        aiSuggestedAlternatives: z.array(z.string().min(1)).default([]),
      }),
    )
    .min(1)
    .max(200),
});

const normalizePrompt = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

const promptFingerprint = (value: string): string =>
  normalizePrompt(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value: string): Set<string> =>
  new Set(promptFingerprint(value).split(' ').filter((token) => token.length > 2));

const jaccardSimilarity = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
};

const dedupeTrimmed = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()))).filter((value) => value.length > 0);

export const importCandidateItemGenerationBatch = async (
  deps: { candidateItemRepository: CandidateItemRepository },
  input: z.input<typeof generationBatchSchema>,
) => {
  const parsed = generationBatchSchema.parse(input);

  const createdBatch = await deps.candidateItemRepository.createGenerationBatch({
    generationId: parsed.generationId.trim(),
    sourceType: parsed.sourceType,
    modelName: parsed.modelName.trim(),
    promptVersion: parsed.promptVersion.trim(),
    targetAssessmentDefinitionId: parsed.targetAssessmentDefinitionId,
    ...(parsed.context ? { context: parsed.context } : {}),
    ...(parsed.rationaleNotes ? { rationaleNotes: parsed.rationaleNotes.trim() } : {}),
    normalizationVersion: ITEM_INTAKE_NORMALIZATION_VERSION,
  });

  const corpus = await deps.candidateItemRepository.getDuplicateScreeningCorpus({
    assessmentDefinitionId: parsed.targetAssessmentDefinitionId,
  });

  const candidateCorpus = corpus.candidateItems.map((item) => ({
    source: 'candidate_item' as const,
    sourceId: item.id,
    sourcePrompt: item.prompt,
    fingerprint: promptFingerprint(item.prompt),
    tokens: tokenize(item.prompt),
  }));
  const promotedCorpus = corpus.promotedQuestions.map((item) => ({
    source: 'promoted_question' as const,
    sourceId: item.id,
    sourcePrompt: item.prompt,
    fingerprint: promptFingerprint(item.prompt),
    tokens: tokenize(item.prompt),
  }));
  const screeningCorpus = [...candidateCorpus, ...promotedCorpus];

  const seenFingerprints = new Set<string>();
  const results: Array<{
    index: number;
    candidateItemId?: UUID;
    status: 'imported' | 'rejected_obvious_duplicate';
    likelyDuplicate: boolean;
    obviousDuplicate: boolean;
    duplicateMatches: Array<{
      source: 'candidate_item' | 'promoted_question';
      sourceId: UUID;
      sourcePrompt: string;
      similarityScore: number;
      obviousDuplicate: boolean;
    }>;
  }> = [];

  for (const [index, rawItem] of parsed.items.entries()) {
    const normalizedPrompt = normalizePrompt(rawItem.prompt);
    const fingerprint = promptFingerprint(normalizedPrompt);
    const tokens = tokenize(normalizedPrompt);

    if (rawItem.role === 'mirror' && rawItem.mirrorReferenceKey !== undefined) {
      if (rawItem.mirrorReferenceKey.trim().length === 0) {
        throw new Error(`Item at index ${index} has an empty mirror reference key`);
      }
    }

    const matches = screeningCorpus
      .map((entry) => {
        const similarityScore =
          entry.fingerprint === fingerprint ? 1 : jaccardSimilarity(tokens, entry.tokens);
        return {
          source: entry.source,
          sourceId: entry.sourceId,
          sourcePrompt: entry.sourcePrompt,
          similarityScore,
          obviousDuplicate: entry.fingerprint === fingerprint,
        };
      })
      .filter((entry) => entry.similarityScore >= 0.75)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 5);

    const obviousDuplicate =
      matches.some((entry) => entry.obviousDuplicate) || seenFingerprints.has(fingerprint);
    const likelyDuplicate = obviousDuplicate || matches.some((entry) => entry.similarityScore >= 0.85);
    const calibration = rawItem.calibration
      ? {
          ...(rawItem.calibration.informationValue !== undefined
            ? { informationValue: rawItem.calibration.informationValue }
            : {}),
          ...(rawItem.calibration.discrimination !== undefined
            ? { discrimination: rawItem.calibration.discrimination }
            : {}),
          ...(rawItem.calibration.difficulty !== undefined
            ? { difficulty: rawItem.calibration.difficulty }
            : {}),
        }
      : undefined;

    if (obviousDuplicate) {
      results.push({
        index,
        status: 'rejected_obvious_duplicate',
        likelyDuplicate,
        obviousDuplicate,
        duplicateMatches: matches,
      });
      continue;
    }

    const created = await deps.candidateItemRepository.createCandidateItem({
      assessmentDefinitionId: parsed.targetAssessmentDefinitionId,
      prompt: normalizedPrompt,
      axis: rawItem.axis,
      axisDirection: rawItem.axisDirection,
      weight: Number(rawItem.weight.toFixed(4)),
      reverseKeyed: rawItem.reverseKeyed,
      role: rawItem.role,
      contextApplicability: Array.from(new Set(rawItem.contextApplicability)),
      disambiguationTags: dedupeTrimmed(rawItem.disambiguationTags),
      adaptiveEligible: rawItem.adaptiveEligible,
      itemPoolGroupIds: dedupeTrimmed(rawItem.itemPoolGroupIds),
      routingTags: dedupeTrimmed(rawItem.routingTags),
      uncertaintyTargetAreas: dedupeTrimmed(rawItem.uncertaintyTargetAreas),
      ...(rawItem.uncertaintyProfile ? { uncertaintyProfile: rawItem.uncertaintyProfile.trim() } : {}),
      ...(calibration !== undefined && Object.keys(calibration).length > 0 ? { calibration } : {}),
      aiGenerated: rawItem.aiGenerated,
      aiModel: rawItem.aiModel.trim(),
      aiPromptVersion: rawItem.aiPromptVersion.trim(),
      ...(rawItem.aiRationale ? { aiRationale: rawItem.aiRationale.trim() } : {}),
      ...(rawItem.aiConfidence !== undefined ? { aiConfidence: rawItem.aiConfidence } : {}),
      aiSuggestedAlternatives: rawItem.aiSuggestedAlternatives.map((entry: string) => entry.trim()),
      generationBatchId: createdBatch.id,
      intakeMetadata: {
        normalizationVersion: ITEM_INTAKE_NORMALIZATION_VERSION,
        duplicateScreeningVersion: ITEM_DUPLICATE_SCREENING_VERSION,
        likelyDuplicate,
        obviousDuplicate,
        duplicateMatches: matches,
      },
    });

    seenFingerprints.add(fingerprint);
    screeningCorpus.push({
      source: 'candidate_item',
      sourceId: created.id,
      sourcePrompt: normalizedPrompt,
      fingerprint,
      tokens,
    });

    results.push({
      index,
      candidateItemId: created.id,
      status: 'imported',
      likelyDuplicate,
      obviousDuplicate,
      duplicateMatches: matches,
    });
  }

  return {
    generationBatch: createdBatch,
    normalizationVersion: ITEM_INTAKE_NORMALIZATION_VERSION,
    duplicateScreeningVersion: ITEM_DUPLICATE_SCREENING_VERSION,
    totalItems: parsed.items.length,
    importedItems: results.filter((result) => result.status === 'imported').length,
    rejectedObviousDuplicates: results.filter(
      (result) => result.status === 'rejected_obvious_duplicate',
    ).length,
    results,
  };
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
