import type {
  GeneratedReport,
  InterpretationCondition,
  InterpretationRule,
  ProfileResult,
  ReportSection,
  ReportTemplate,
} from './models.js';

const DEFAULT_LOW_MAX = 33;
const DEFAULT_HIGH_MIN = 67;

const isConditionMatched = (
  condition: InterpretationCondition,
  scores: number[],
  topDimensionKey: string | undefined,
  lowestDimensionKey: string | undefined,
  targetDimensionKeys: string[],
): boolean => {
  if (scores.length === 0 && (condition.type === 'high' || condition.type === 'medium' || condition.type === 'low')) {
    return false;
  }

  switch (condition.type) {
    case 'high': {
      const minScore = condition.minScore ?? DEFAULT_HIGH_MIN;
      return scores.every((score) => score >= minScore);
    }
    case 'medium': {
      const minScore = condition.minScore ?? DEFAULT_LOW_MAX + 1;
      const maxScore = condition.maxScore ?? DEFAULT_HIGH_MIN - 1;
      return scores.every((score) => score >= minScore && score <= maxScore);
    }
    case 'low': {
      const maxScore = condition.maxScore ?? DEFAULT_LOW_MAX;
      return scores.every((score) => score <= maxScore);
    }
    case 'top_dimension': {
      return Boolean(topDimensionKey && targetDimensionKeys.includes(topDimensionKey));
    }
    case 'lowest_dimension': {
      return Boolean(lowestDimensionKey && targetDimensionKeys.includes(lowestDimensionKey));
    }
    default:
      return false;
  }
};

const resolveTargetScores = (
  profileResult: ProfileResult,
  rule: InterpretationRule,
): number[] => {
  return rule.target.dimensionKeys
    .map((key) => profileResult.scoreBreakdown.find((item) => item.dimensionKey === key)?.normalizedScore)
    .filter((score): score is number => score !== undefined);
};

export const generateReport = (input: {
  profileResult: ProfileResult;
  reportTemplate: ReportTemplate;
}): GeneratedReport => {
  const { profileResult, reportTemplate } = input;

  const orderedBreakdown = profileResult.scoreBreakdown
    .slice()
    .sort((a, b) => b.normalizedScore - a.normalizedScore || a.dimensionKey.localeCompare(b.dimensionKey));

  const topDimensionKey = orderedBreakdown[0]?.dimensionKey;
  const lowestDimensionKey = orderedBreakdown[orderedBreakdown.length - 1]?.dimensionKey;

  const sectionsByKey = new Map<string, ReportSection>(
    reportTemplate.sections.map((section) => [section.key, section]),
  );
  const contentBySectionKey = new Map<string, string[]>();

  reportTemplate.interpretationRules
    .slice()
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .forEach((rule) => {
      const section = sectionsByKey.get(rule.sectionKey);
      if (!section) {
        return;
      }

      const scores = resolveTargetScores(profileResult, rule);
      const matches = isConditionMatched(
        rule.condition,
        scores,
        topDimensionKey,
        lowestDimensionKey,
        rule.target.dimensionKeys,
      );

      if (!matches) {
        return;
      }

      const existing = contentBySectionKey.get(section.key) ?? [];
      existing.push(rule.output);
      contentBySectionKey.set(section.key, existing);
    });

  const sections = reportTemplate.sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      key: section.key,
      title: section.title,
      order: section.order,
      content: contentBySectionKey.get(section.key) ?? [],
    }));

  return {
    id: `${profileResult.id}:${reportTemplate.id}`,
    sessionId: profileResult.sessionId,
    templateId: reportTemplate.id,
    resultSnapshot: profileResult,
    sections,
    generatedAt: new Date(profileResult.calculatedAt),
  };
};
