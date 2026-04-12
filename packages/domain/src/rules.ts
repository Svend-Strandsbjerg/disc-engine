import type {
  AssessmentVersion,
  ProfileResult,
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
  calculate(input: {
    assessmentVersion: AssessmentVersion;
    responses: Response[];
  }): ProfileResult;
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
  return scoringVersion === 'disc-v1-likert-16';
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

  const ruleIndex = buildRuleIndex(assessmentVersion.scoringRules);
  const auditTrail: ProfileResult['auditTrail'] = [];

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

  const rawValues = [...dimensionScores.values()];
  const maxRawScore = rawValues.length > 0 ? Math.max(...rawValues) : 0;
  const totalRawScore = rawValues.reduce((sum, value) => sum + value, 0);
  const normalizationMode = useTotalShareNormalization(assessmentVersion.scoringVersion) ? 'total_share' : 'max';
  const normalizationDenominator = normalizationMode === 'total_share' ? totalRawScore : maxRawScore;

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
    .sort((a, b) => b.normalizedScore - a.normalizedScore || b.rawScore - a.rawScore || a.dimensionKey.localeCompare(b.dimensionKey))[0];

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
    totalScores: Object.fromEntries(scoreBreakdown.map((item) => [item.dimensionKey, item.rawScore])),
    rawResponsesSnapshot: responses,
    calculatedAt: new Date(assessmentVersion.createdAt),
    auditTrail,
  };
};

export const createDefaultScoringEngine = (): ScoringEngine => ({
  calculate: ({ assessmentVersion, responses }) =>
    calculateProfileResult({ assessmentVersion, responses }),
});
