import type {
  AssessmentVersion,
  AxisDirection,
  DiscAxis,
  ItemDiagnostics,
  ItemResponseDistribution,
  ItemRole,
  MeasurementAnalysisSnapshot,
  MirrorConsistencyCheck,
  ProfileResult,
  Question,
  Response,
  ScoreBreakdownItem,
  ScoringRule,
} from './models.js';

export const canPublishVersion = (version: AssessmentVersion): boolean => {
  return version.status === 'draft' && version.questionCount > 0;
};

export const isImmutableVersion = (version: AssessmentVersion): boolean => {
  return version.immutableAt !== undefined;
};

export const assertVersionEditable = (version: AssessmentVersion): void => {
  if (isImmutableVersion(version) || version.status === 'published') {
    throw new Error(`Assessment version ${version.id} is immutable and cannot be edited.`);
  }
};

export interface ScoringEngine {
  calculate(input: { assessmentVersion: AssessmentVersion; responses: Response[] }): ProfileResult;
}

const buildRuleIndex = (rules: ScoringRule[]): Map<string, ScoringRule> => {
  return new Map(rules.map((rule) => [`${rule.questionId}:${rule.optionId}`, rule]));
};

const normalize = (raw: number, denominator: number): number => {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((raw / denominator) * 100).toFixed(2));
};

const useTotalShareNormalization = (scoringVersion: string): boolean => {
  return (
    scoringVersion === 'disc-v1-likert-16' ||
    scoringVersion === 'disc-v2-axes' ||
    scoringVersion === 'disc-v3-item-bank'
  );
};

interface AxisItemMetadata {
  axis: DiscAxis;
  axisDirection: AxisDirection;
  weight?: number;
  reverseKeyed?: boolean;
  role?: ItemRole;
  mirrorOf?: string;
  contextApplicability?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseAxisMetadata = (question: Question): AxisItemMetadata | null => {
  if (!isRecord(question.metadata)) return null;

  const axis = question.metadata.axis;
  const axisDirection = question.metadata.axisDirection;

  if (
    (axis !== 'tempo' && axis !== 'focus') ||
    (axisDirection !== 'highTempo' &&
      axisDirection !== 'lowTempo' &&
      axisDirection !== 'taskFocus' &&
      axisDirection !== 'peopleFocus')
  ) {
    return null;
  }

  return {
    axis,
    axisDirection,
    ...(typeof question.metadata.weight === 'number' ? { weight: question.metadata.weight } : {}),
    ...(typeof question.metadata.reverseKeyed === 'boolean'
      ? { reverseKeyed: question.metadata.reverseKeyed }
      : {}),
    ...(question.metadata.role === 'core' ||
    question.metadata.role === 'mirror' ||
    question.metadata.role === 'tiebreaker'
      ? { role: question.metadata.role }
      : {}),
    ...(typeof question.metadata.mirrorOf === 'string'
      ? { mirrorOf: question.metadata.mirrorOf }
      : {}),
    ...(Array.isArray(question.metadata.contextApplicability) &&
    question.metadata.contextApplicability.every((value) => typeof value === 'string')
      ? { contextApplicability: question.metadata.contextApplicability as string[] }
      : {}),
  };
};

const getOptionIntensity = (question: Question, optionId: string): number | null => {
  const option = question.options.find((item) => item.id === optionId);
  if (!option) return null;
  const intensityFromMetadata =
    isRecord(option.metadata) && typeof option.metadata.intensity === 'number'
      ? option.metadata.intensity
      : null;
  if (intensityFromMetadata !== null) return intensityFromMetadata;
  return option.order - 1;
};

const getQuestionScaleMax = (question: Question): number => {
  const intensities = question.options
    .map((option) =>
      isRecord(option.metadata) && typeof option.metadata.intensity === 'number'
        ? option.metadata.intensity
        : option.order - 1,
    )
    .filter((value) => Number.isFinite(value));
  return intensities.length > 0 ? Math.max(...intensities) : 0;
};

const applyReverseKey = (value: number, scaleMax: number, reverseKeyed: boolean): number => {
  if (!reverseKeyed) return value;
  return Math.max(0, scaleMax - value);
};

const deriveDiscFromAxes = (
  axisDirectionScores: Record<AxisDirection, number>,
): Record<'D' | 'I' | 'S' | 'C', number> => {
  return {
    D: axisDirectionScores.highTempo + axisDirectionScores.taskFocus,
    I: axisDirectionScores.highTempo + axisDirectionScores.peopleFocus,
    S: axisDirectionScores.lowTempo + axisDirectionScores.peopleFocus,
    C: axisDirectionScores.lowTempo + axisDirectionScores.taskFocus,
  };
};

export const calculateProfileResult = (input: {
  responses: Response[];
  assessmentVersion: AssessmentVersion;
}): ProfileResult => {
  const { responses, assessmentVersion } = input;

  const dimensionScores = new Map<string, number>(
    assessmentVersion.dimensions.map((dimension) => [dimension.key, 0]),
  );
  const evidence = new Map<string, string[]>(
    assessmentVersion.dimensions.map((dimension) => [dimension.key, []]),
  );
  const auditTrail: ProfileResult['auditTrail'] = [];
  const questionById = new Map(
    assessmentVersion.questions.map((question) => [question.id, question] as const),
  );

  let measurementAnalysis: MeasurementAnalysisSnapshot | undefined;

  if (
    assessmentVersion.scoringVersion === 'disc-v2-axes' ||
    assessmentVersion.scoringVersion === 'disc-v3-item-bank'
  ) {
    const captureMeasurementAnalysis = assessmentVersion.scoringVersion === 'disc-v3-item-bank';
    const axisDirectionScores: Record<AxisDirection, number> = {
      highTempo: 0,
      lowTempo: 0,
      taskFocus: 0,
      peopleFocus: 0,
    };
    const axisEvidence: Record<AxisDirection, string[]> = {
      highTempo: [],
      lowTempo: [],
      taskFocus: [],
      peopleFocus: [],
    };
    const alignedValuesByQuestionCode = new Map<string, { alignedValue: number; scaleMax: number }>();
    const responseByQuestionCode = new Map<string, { responseId: string }>();
    const itemContributions: NonNullable<MeasurementAnalysisSnapshot['itemContributions']> = [];
    const mirrorChecks: MirrorConsistencyCheck[] = [];
    const itemDistributionStats = new Map<
      string,
      {
        questionId: string;
        questionCode: string;
        axisDirection: AxisDirection;
        role: ItemRole;
        responseCount: number;
        optionSelections: Record<string, number>;
      }
    >();
    const diagnostics: ItemDiagnostics = {
      missingMetadataQuestionIds: [],
      mirrorOrphans: [],
      zeroWeightQuestionIds: [],
      negativeWeightQuestionIds: [],
    };
    let mirrorPairs = 0;
    let mirrorContradictions = 0;

    responses.forEach((response, responseIndex) => {
      const question = questionById.get(response.questionId);
      if (!question) {
        return;
      }

      const metadata = parseAxisMetadata(question);
      if (!metadata) {
        diagnostics.missingMetadataQuestionIds.push(response.questionId);
        auditTrail.push({
          id: `${assessmentVersion.id}:missing-axis-metadata:${response.id}`,
          occurredAt: new Date(assessmentVersion.createdAt),
          type: 'missing_axis_metadata',
          payload: { responseId: response.id, questionId: response.questionId },
        });
        return;
      }

      const selectedOptionId = response.selectedOptionIds[0];
      if (!selectedOptionId) return;
      const selectedOption = question.options.find((option) => option.id === selectedOptionId);
      if (!selectedOption) return;

      const intensity = getOptionIntensity(question, selectedOptionId);
      if (intensity === null) return;

      const scaleMax = getQuestionScaleMax(question);
      const alignedValue = applyReverseKey(intensity, scaleMax, metadata.reverseKeyed ?? false);
      const weight = metadata.weight ?? 1;
      const weightedContribution = alignedValue * weight;
      if (weight === 0) diagnostics.zeroWeightQuestionIds.push(question.id);
      if (weight < 0) diagnostics.negativeWeightQuestionIds.push(question.id);
      const role = metadata.role ?? 'core';

      axisDirectionScores[metadata.axisDirection] += weightedContribution;
      axisEvidence[metadata.axisDirection].push(
        `response:${response.id}|q:${response.questionId}|opt:${selectedOptionId}|aligned:${alignedValue}|w:${weight}`,
      );

      if (role === 'core') {
        alignedValuesByQuestionCode.set(question.code, { alignedValue, scaleMax });
        responseByQuestionCode.set(question.code, { responseId: response.id });
      }
      if (role === 'mirror' && metadata.mirrorOf) {
        const mirrored = alignedValuesByQuestionCode.get(metadata.mirrorOf);
        if (mirrored) {
          mirrorPairs += 1;
          const comparisonScaleMax = Math.max(mirrored.scaleMax, scaleMax);
          const contradictionThreshold = comparisonScaleMax / 2;
          const absoluteDifference = Math.abs(mirrored.alignedValue - alignedValue);
          const contradicted = absoluteDifference > contradictionThreshold;
          const mirroredResponseId = responseByQuestionCode.get(metadata.mirrorOf)?.responseId;
          if (contradicted) {
            mirrorContradictions += 1;
          }
          mirrorChecks.push({
            mirrorQuestionCode: question.code,
            mirroredQuestionCode: metadata.mirrorOf,
            mirrorResponseId: response.id,
            ...(mirroredResponseId !== undefined ? { mirroredResponseId } : {}),
            mirrorAlignedValue: alignedValue,
            mirroredAlignedValue: mirrored.alignedValue,
            comparisonScaleMax,
            contradictionThreshold,
            absoluteDifference,
            contradicted,
          });
        } else {
          diagnostics.mirrorOrphans.push(`${question.code}->${metadata.mirrorOf}`);
          mirrorChecks.push({
            mirrorQuestionCode: question.code,
            mirroredQuestionCode: metadata.mirrorOf,
            mirrorResponseId: response.id,
            mirrorAlignedValue: alignedValue,
            comparisonScaleMax: scaleMax,
            contradictionThreshold: scaleMax / 2,
            contradicted: false,
          });
        }
      }

      const distributionKey = `${question.id}:${metadata.axisDirection}`;
      const distribution = itemDistributionStats.get(distributionKey) ?? {
        questionId: question.id,
        questionCode: question.code,
        axisDirection: metadata.axisDirection,
        role,
        responseCount: 0,
        optionSelections: {},
      };
      distribution.responseCount += 1;
      distribution.optionSelections[selectedOption.code] =
        (distribution.optionSelections[selectedOption.code] ?? 0) + 1;
      itemDistributionStats.set(distributionKey, distribution);

      itemContributions.push({
        questionId: question.id,
        questionCode: question.code,
        responseId: response.id,
        axis: metadata.axis,
        axisDirection: metadata.axisDirection,
        role,
        reverseKeyed: metadata.reverseKeyed ?? false,
        selectedOptionId,
        selectedOptionCode: selectedOption.code,
        selectedOptionOrder: selectedOption.order,
        selectedIntensity: intensity,
        alignedValue,
        weight,
        weightedContribution,
        ...(metadata.contextApplicability
          ? { contextApplicability: metadata.contextApplicability }
          : {}),
      });

      auditTrail.push({
        id: `${assessmentVersion.id}:axis-apply:${responseIndex}:${response.id}:${metadata.axisDirection}`,
        occurredAt: new Date(assessmentVersion.createdAt),
        type: 'axis_item_applied',
        payload: {
          responseId: response.id,
          questionId: response.questionId,
          optionId: selectedOptionId,
          axis: metadata.axis,
          axisDirection: metadata.axisDirection,
          reverseKeyed: metadata.reverseKeyed ?? false,
          weight,
          role,
          ...(metadata.contextApplicability
            ? { contextApplicability: metadata.contextApplicability }
            : {}),
          alignedValue,
          weightedContribution,
        },
      });
    });

    const derivedDiscScores = deriveDiscFromAxes(axisDirectionScores);
    Object.entries(derivedDiscScores).forEach(([key, value]) => {
      dimensionScores.set(key, value);
      const dimensionEvidence = evidence.get(key) ?? [];
      if (key === 'D') dimensionEvidence.push(...axisEvidence.highTempo, ...axisEvidence.taskFocus);
      if (key === 'I')
        dimensionEvidence.push(...axisEvidence.highTempo, ...axisEvidence.peopleFocus);
      if (key === 'S')
        dimensionEvidence.push(...axisEvidence.lowTempo, ...axisEvidence.peopleFocus);
      if (key === 'C') dimensionEvidence.push(...axisEvidence.lowTempo, ...axisEvidence.taskFocus);
      evidence.set(key, dimensionEvidence);
    });

    auditTrail.push({
      id: `${assessmentVersion.id}:disc-derivation:disc-v2-axes`,
      occurredAt: new Date(assessmentVersion.createdAt),
      type: 'disc_derived_from_axes',
      payload: {
        mapping: {
          D: ['highTempo', 'taskFocus'],
          I: ['highTempo', 'peopleFocus'],
          S: ['lowTempo', 'peopleFocus'],
          C: ['lowTempo', 'taskFocus'],
        },
        axisDirectionScores,
        derivedDiscScores,
      },
    });

    auditTrail.push({
      id: `${assessmentVersion.id}:mirror-consistency:disc-v2-axes`,
      occurredAt: new Date(assessmentVersion.createdAt),
      type: 'mirror_consistency_evaluated',
      payload: {
        mirrorPairs,
        mirrorContradictions,
        contradictionRate:
          mirrorPairs > 0 ? Number((mirrorContradictions / mirrorPairs).toFixed(2)) : 0,
      },
    });

    if (captureMeasurementAnalysis) {
      const responseDistributions: ItemResponseDistribution[] = [...itemDistributionStats.values()].sort(
        (a, b) => a.questionCode.localeCompare(b.questionCode),
      );
      measurementAnalysis = {
        version: 'disc-v3-item-bank',
        itemContributions,
        mirrorConsistency: {
          mirrorPairs,
          mirrorContradictions,
          contradictionRate:
            mirrorPairs > 0 ? Number((mirrorContradictions / mirrorPairs).toFixed(2)) : 0,
          checks: mirrorChecks,
        },
        responseDistributions,
        diagnostics,
      };

      auditTrail.push({
        id: `${assessmentVersion.id}:item-bank-analysis:disc-v3-item-bank`,
        occurredAt: new Date(assessmentVersion.createdAt),
        type: 'item_bank_analysis_captured',
        payload: {
          itemContributionCount: itemContributions.length,
          mirrorPairs,
          mirrorContradictions,
          distributionItemCount: responseDistributions.length,
          diagnostics,
        },
      });
    }
  } else {
    const ruleIndex = buildRuleIndex(assessmentVersion.scoringRules);
    // TODO: Add value-based scoring hooks for scale/text question types.
    responses.forEach((response, responseIndex) => {
      response.selectedOptionIds.forEach((optionId) => {
        const rule = ruleIndex.get(`${response.questionId}:${optionId}`);
        if (!rule) {
          auditTrail.push({
            id: `${assessmentVersion.id}:missing-rule:${response.id}:${optionId}`,
            occurredAt: new Date(assessmentVersion.createdAt),
            type: 'missing_scoring_rule',
            payload: { responseId: response.id, questionId: response.questionId, optionId },
          });
          return;
        }

        rule.impacts.forEach((impact) => {
          const current = dimensionScores.get(impact.dimensionKey) ?? 0;
          const next = current + impact.weight;
          dimensionScores.set(impact.dimensionKey, next);

          const evidenceList = evidence.get(impact.dimensionKey) ?? [];
          evidenceList.push(
            `response:${response.id}|q:${response.questionId}|opt:${optionId}|w:${impact.weight}`,
          );
          evidence.set(impact.dimensionKey, evidenceList);

          auditTrail.push({
            id: `${assessmentVersion.id}:apply:${responseIndex}:${response.id}:${impact.dimensionKey}`,
            occurredAt: new Date(assessmentVersion.createdAt),
            type: 'rule_applied',
            payload: {
              responseId: response.id,
              questionId: response.questionId,
              optionId,
              dimensionKey: impact.dimensionKey,
              weight: impact.weight,
            },
          });
        });
      });
    });
  }

  const rawValues = [...dimensionScores.values()];
  const maxRawScore = rawValues.length > 0 ? Math.max(...rawValues) : 0;
  const totalRawScore = rawValues.reduce((sum, value) => sum + value, 0);
  const normalizationMode = useTotalShareNormalization(assessmentVersion.scoringVersion)
    ? 'total_share'
    : 'max';
  const normalizationDenominator =
    normalizationMode === 'total_share' ? totalRawScore : maxRawScore;

  const scoreBreakdown: ScoreBreakdownItem[] = assessmentVersion.dimensions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((dimension) => {
      const rawScore = dimensionScores.get(dimension.key) ?? 0;
      return {
        dimensionKey: dimension.key,
        dimensionLabel: dimension.label,
        rawScore,
        normalizedScore: normalize(rawScore, normalizationDenominator),
        evidence: evidence.get(dimension.key) ?? [],
      };
    });

  auditTrail.push({
    id: `${assessmentVersion.id}:normalization:${normalizationMode}`,
    occurredAt: new Date(assessmentVersion.createdAt),
    type: 'normalization_applied',
    payload: {
      scoringVersion: assessmentVersion.scoringVersion,
      mode: normalizationMode,
      denominator: normalizationDenominator,
    },
  });

  const highest = scoreBreakdown
    .slice()
    .sort(
      (a, b) =>
        b.normalizedScore - a.normalizedScore ||
        b.rawScore - a.rawScore ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    )[0];

  const sessionId = responses[0]?.sessionId ?? 'unknown-session';

  return {
    id: `${sessionId}:${assessmentVersion.scoringVersion}`,
    sessionId,
    assessmentVersionId: assessmentVersion.id,
    scoringVersion: assessmentVersion.scoringVersion,
    profileCode: highest?.dimensionKey ?? 'unscored',
    summary: highest
      ? `Highest scoring dimension: ${highest.dimensionKey} (${highest.normalizedScore}).`
      : 'No scored responses available.',
    scoreBreakdown,
    totalScores: Object.fromEntries(
      scoreBreakdown.map((item) => [item.dimensionKey, item.rawScore]),
    ),
    rawResponsesSnapshot: responses,
    calculatedAt: new Date(assessmentVersion.createdAt),
    auditTrail,
    ...(measurementAnalysis ? { measurementAnalysis } : {}),
  };
};

export const createDefaultScoringEngine = (): ScoringEngine => ({
  calculate: ({ assessmentVersion, responses }) =>
    calculateProfileResult({ assessmentVersion, responses }),
});
