import type { AssessmentReadRepository, ResultQueryRepository } from '../ports/repositories.js';
import type { AxisDirection, ItemRole, Response } from '@disc-foundation/domain';
import type { UUID } from '@disc-foundation/shared';

type TopDimension = 'D' | 'I' | 'S' | 'C' | 'unknown';

type ItemStats = {
  questionId: UUID;
  questionCode: string;
  role: ItemRole;
  axisDirection: AxisDirection;
  responseCount: number;
  optionCounts: Record<string, number>;
  topDimensionCounts: Record<TopDimension, number>;
  mirrorChecks: number;
  mirrorContradictions: number;
};

export type PilotWeakItemFlagType =
  | 'high_concentration'
  | 'low_profile_separation'
  | 'high_mirror_contradiction'
  | 'low_sample_size';

export interface PilotWeakItemFlag {
  type: PilotWeakItemFlagType;
  message: string;
  value: number;
  threshold: number;
}

export interface PilotItemReview {
  questionId: UUID;
  questionCode: string;
  role: ItemRole;
  axisDirection: AxisDirection;
  responseCount: number;
  optionDistribution: Array<{ optionCode: string; count: number; ratio: number }>;
  concentrationRatio: number;
  mirrorContradictionRate?: number;
  dominantDimensionDistribution: Array<{ dimension: TopDimension; count: number; ratio: number }>;
  profileSeparationScore: number;
  weakItemFlags: PilotWeakItemFlag[];
}

export interface PilotItemBankAnalysis {
  analysisVersion: 'v1';
  scoringVersion: 'disc-v3-item-bank';
  assessmentVersionId: UUID;
  generatedAt: Date;
  filters: {
    from?: Date;
    to?: Date;
  };
  sample: {
    sessionCount: number;
    responseCount: number;
  };
  summary: {
    itemCount: number;
    weakItemCount: number;
    mirrorPairCount: number;
    mirrorContradictionRate: number;
  };
  items: PilotItemReview[];
}

const toRatio = (value: number, total: number): number =>
  total > 0 ? Number((value / total).toFixed(4)) : 0;

const parseItemMetadata = (
  metadata: unknown,
): { role: ItemRole; axisDirection: AxisDirection; reverseKeyed: boolean; mirrorOf?: string } | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const role = record.role;
  const axisDirection = record.axisDirection;
  if (
    (role !== 'core' && role !== 'mirror' && role !== 'tiebreaker') ||
    (axisDirection !== 'highTempo' &&
      axisDirection !== 'lowTempo' &&
      axisDirection !== 'taskFocus' &&
      axisDirection !== 'peopleFocus')
  ) {
    return null;
  }

  const reverseKeyed = record.reverseKeyed === true;
  const mirrorOf = typeof record.mirrorOf === 'string' ? record.mirrorOf : undefined;

  return { role, axisDirection, reverseKeyed, ...(mirrorOf ? { mirrorOf } : {}) };
};

const getTopDimension = (scoreBreakdown: Array<{ dimensionKey: string; normalizedScore: number }>): TopDimension => {
  const [firstEntry, ...remainingEntries] = scoreBreakdown;
  if (!firstEntry) {
    return 'unknown';
  }

  let top = firstEntry;
  for (const entry of remainingEntries) {
    if (entry.normalizedScore > top.normalizedScore) {
      top = entry;
    }
  }

  const key = top.dimensionKey.toUpperCase();
  if (key === 'D' || key === 'I' || key === 'S' || key === 'C') {
    return key;
  }

  return 'unknown';
};

const getAlignedValue = (input: {
  selectedOptionOrder: number;
  optionCount: number;
  reverseKeyed: boolean;
}): number => {
  const intensity = input.selectedOptionOrder + 1;
  const scaleMax = Math.max(input.optionCount, 1);
  if (!input.reverseKeyed) {
    return intensity;
  }
  return Math.max(0, scaleMax - intensity);
};

export const getPilotItemBankAnalysis = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    resultQueryRepository: ResultQueryRepository;
  },
  input: {
    assessmentVersionId: UUID;
    from?: Date;
    to?: Date;
    minSampleSize?: number;
    concentrationThreshold?: number;
    separationThreshold?: number;
    mirrorContradictionThreshold?: number;
  },
): Promise<PilotItemBankAnalysis> => {
  const assessmentVersion = await deps.assessmentReadRepository.getVersion(input.assessmentVersionId);
  if (!assessmentVersion) {
    throw new Error('Assessment version not found');
  }
  if (assessmentVersion.scoringVersion !== 'disc-v3-item-bank') {
    throw new Error('Pilot analysis is only available for disc-v3-item-bank');
  }

  const minSampleSize = input.minSampleSize ?? 20;
  const concentrationThreshold = input.concentrationThreshold ?? 0.85;
  const separationThreshold = input.separationThreshold ?? 0.8;
  const mirrorContradictionThreshold = input.mirrorContradictionThreshold ?? 0.35;

  const itemStatsByQuestionId = new Map<UUID, ItemStats>();
  const questionById = new Map(assessmentVersion.questions.map((question) => [question.id, question] as const));

  let sessionCount = 0;
  let responseCount = 0;
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const page = await deps.resultQueryRepository.listResultsByAssessmentVersion({
      assessmentVersionId: input.assessmentVersionId,
      sessionStatus: 'completed',
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      limit: pageSize,
      offset,
    });

    for (const result of page.items) {
      sessionCount += 1;
      const topDimension = getTopDimension(result.scoreBreakdown);
      const responseByQuestionCode = new Map<string, { alignedValue: number; optionCount: number }>();

      for (const response of result.rawResponsesSnapshot as Response[]) {
        const selectedOptionId = response.selectedOptionIds[0];
        if (!selectedOptionId) {
          continue;
        }

        const question = questionById.get(response.questionId);
        if (!question) {
          continue;
        }

        const metadata = parseItemMetadata(question.metadata);
        if (!metadata) {
          continue;
        }

        const selectedOption = question.options.find((option) => option.id === selectedOptionId);
        if (!selectedOption) {
          continue;
        }

        const item = itemStatsByQuestionId.get(question.id) ?? {
          questionId: question.id,
          questionCode: question.code,
          role: metadata.role,
          axisDirection: metadata.axisDirection,
          responseCount: 0,
          optionCounts: {},
          topDimensionCounts: { D: 0, I: 0, S: 0, C: 0, unknown: 0 },
          mirrorChecks: 0,
          mirrorContradictions: 0,
        };

        item.responseCount += 1;
        item.optionCounts[selectedOption.code] = (item.optionCounts[selectedOption.code] ?? 0) + 1;
        item.topDimensionCounts[topDimension] = (item.topDimensionCounts[topDimension] ?? 0) + 1;
        responseCount += 1;

        const alignedValue = getAlignedValue({
          selectedOptionOrder: selectedOption.order,
          optionCount: question.options.length,
          reverseKeyed: metadata.reverseKeyed,
        });

        if (metadata.role === 'core') {
          responseByQuestionCode.set(question.code, {
            alignedValue,
            optionCount: question.options.length,
          });
        }

        if (metadata.role === 'mirror' && metadata.mirrorOf) {
          const mirrored = responseByQuestionCode.get(metadata.mirrorOf);
          if (mirrored) {
            item.mirrorChecks += 1;
            const comparisonScaleMax = Math.max(mirrored.optionCount, question.options.length);
            const contradictionThreshold = comparisonScaleMax / 2;
            const absoluteDifference = Math.abs(mirrored.alignedValue - alignedValue);
            if (absoluteDifference > contradictionThreshold) {
              item.mirrorContradictions += 1;
            }
          }
        }

        itemStatsByQuestionId.set(question.id, item);
      }
    }

    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) {
      break;
    }
  }

  const items = [...itemStatsByQuestionId.values()]
    .map((item): PilotItemReview => {
      const optionDistribution = Object.entries(item.optionCounts)
        .map(([optionCode, count]) => ({ optionCode, count, ratio: toRatio(count, item.responseCount) }))
        .sort((a, b) => b.count - a.count);

      const dominantDimensionDistribution = Object.entries(item.topDimensionCounts)
        .filter(([, count]) => count > 0)
        .map(([dimension, count]) => ({
          dimension: dimension as TopDimension,
          count,
          ratio: toRatio(count, item.responseCount),
        }))
        .sort((a, b) => b.count - a.count);

      const concentrationRatio = optionDistribution[0]?.ratio ?? 0;
      const topDimensionRatio = dominantDimensionDistribution[0]?.ratio ?? 0;
      const profileSeparationScore = Number((1 - topDimensionRatio).toFixed(4));
      const mirrorContradictionRate =
        item.mirrorChecks > 0 ? toRatio(item.mirrorContradictions, item.mirrorChecks) : undefined;

      const weakItemFlags: PilotWeakItemFlag[] = [];

      if (item.responseCount < minSampleSize) {
        weakItemFlags.push({
          type: 'low_sample_size',
          message: 'Item has too few responses for reliable pilot interpretation.',
          value: item.responseCount,
          threshold: minSampleSize,
        });
      }

      if (concentrationRatio >= concentrationThreshold) {
        weakItemFlags.push({
          type: 'high_concentration',
          message: 'Most respondents chose one option, indicating weak differentiation.',
          value: concentrationRatio,
          threshold: concentrationThreshold,
        });
      }

      if (topDimensionRatio >= separationThreshold) {
        weakItemFlags.push({
          type: 'low_profile_separation',
          message: 'Item responses are concentrated in one dominant profile dimension.',
          value: topDimensionRatio,
          threshold: separationThreshold,
        });
      }

      if (
        typeof mirrorContradictionRate === 'number' &&
        item.role === 'mirror' &&
        mirrorContradictionRate >= mirrorContradictionThreshold
      ) {
        weakItemFlags.push({
          type: 'high_mirror_contradiction',
          message: 'Mirror item contradicts its paired core item too often.',
          value: mirrorContradictionRate,
          threshold: mirrorContradictionThreshold,
        });
      }

      return {
        questionId: item.questionId,
        questionCode: item.questionCode,
        role: item.role,
        axisDirection: item.axisDirection,
        responseCount: item.responseCount,
        optionDistribution,
        concentrationRatio,
        ...(typeof mirrorContradictionRate === 'number' ? { mirrorContradictionRate } : {}),
        dominantDimensionDistribution,
        profileSeparationScore,
        weakItemFlags,
      };
    })
    .sort((a, b) => {
      if (b.weakItemFlags.length !== a.weakItemFlags.length) {
        return b.weakItemFlags.length - a.weakItemFlags.length;
      }
      return a.questionCode.localeCompare(b.questionCode);
    });

  const mirrorPairCount = items.reduce((sum, item) => {
    return sum + (item.role === 'mirror' && typeof item.mirrorContradictionRate === 'number' ? 1 : 0);
  }, 0);
  const mirrorContradictionRate =
    mirrorPairCount > 0
      ? Number(
          (
            items
              .filter((item) => item.role === 'mirror' && typeof item.mirrorContradictionRate === 'number')
              .reduce((sum, item) => sum + (item.mirrorContradictionRate ?? 0), 0) / mirrorPairCount
          ).toFixed(4),
        )
      : 0;

  return {
    analysisVersion: 'v1',
    scoringVersion: 'disc-v3-item-bank',
    assessmentVersionId: assessmentVersion.id,
    generatedAt: new Date(),
    filters: {
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
    },
    sample: {
      sessionCount,
      responseCount,
    },
    summary: {
      itemCount: items.length,
      weakItemCount: items.filter((item) => item.weakItemFlags.length > 0).length,
      mirrorPairCount,
      mirrorContradictionRate,
    },
    items,
  };
};
