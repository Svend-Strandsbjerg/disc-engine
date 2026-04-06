import type { AssessmentVersion } from './models.js';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  message: string;
  entityType: 'assessment_version' | 'dimension' | 'question' | 'option' | 'scoring_rule';
  entityId: string | null;
  severity: ValidationSeverity;
}

export interface AssessmentVersionValidationResult {
  isPublishable: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export const MIN_RECOMMENDED_QUESTION_COUNT = 6;

const createIssue = (issue: ValidationIssue): ValidationIssue => issue;

const countBy = <T>(items: T[], keyFn: (item: T) => string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const hasBalancedCoverage = (optionCount: number, coveredOptionCount: number): boolean => {
  if (optionCount <= 1) {
    return coveredOptionCount === optionCount;
  }

  return coveredOptionCount / optionCount >= 0.5;
};

export const validateAssessmentVersionForPublish = (
  assessmentVersion: AssessmentVersion,
): AssessmentVersionValidationResult => {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const questionById = new Map(assessmentVersion.questions.map((question) => [question.id, question]));
  const optionById = new Map(
    assessmentVersion.questions.flatMap((question) =>
      question.options.map((option) => [option.id, { option, questionId: question.id }] as const),
    ),
  );
  const dimensionByKey = new Map(assessmentVersion.dimensions.map((dimension) => [dimension.key, dimension]));

  if (assessmentVersion.dimensions.length === 0) {
    errors.push(
      createIssue({
        code: 'NO_DIMENSIONS',
        message: 'At least one score dimension is required before publish.',
        entityType: 'assessment_version',
        entityId: assessmentVersion.id,
        severity: 'error',
      }),
    );
  }

  if (assessmentVersion.questions.length === 0) {
    errors.push(
      createIssue({
        code: 'NO_QUESTIONS',
        message: 'At least one question is required before publish.',
        entityType: 'assessment_version',
        entityId: assessmentVersion.id,
        severity: 'error',
      }),
    );
  }

  const duplicateDimensionKeys = [...countBy(assessmentVersion.dimensions, (dimension) => dimension.key)].filter(
    ([, count]) => count > 1,
  );
  for (const [key] of duplicateDimensionKeys) {
    errors.push(
      createIssue({
        code: 'DUPLICATE_DIMENSION_KEY',
        message: `Dimension key '${key}' is duplicated within this assessment version.`,
        entityType: 'dimension',
        entityId: null,
        severity: 'error',
      }),
    );
  }

  const duplicateQuestionOrders = [...countBy(assessmentVersion.questions, (question) => `${question.order}`)].filter(
    ([, count]) => count > 1,
  );
  for (const [order] of duplicateQuestionOrders) {
    errors.push(
      createIssue({
        code: 'DUPLICATE_QUESTION_ORDER',
        message: `Question order '${order}' is duplicated within this assessment version.`,
        entityType: 'question',
        entityId: null,
        severity: 'error',
      }),
    );
  }

  const rulesByQuestionOption = new Map<string, number>();
  const usedDimensionKeys = new Set<string>();

  for (const rule of assessmentVersion.scoringRules) {
    const question = questionById.get(rule.questionId);
    const optionLink = optionById.get(rule.optionId);

    if (!question) {
      errors.push(
        createIssue({
          code: 'RULE_MISSING_QUESTION',
          message: `Scoring rule '${rule.id}' references missing question '${rule.questionId}'.`,
          entityType: 'scoring_rule',
          entityId: rule.id,
          severity: 'error',
        }),
      );
      continue;
    }

    if (!optionLink) {
      errors.push(
        createIssue({
          code: 'RULE_MISSING_OPTION',
          message: `Scoring rule '${rule.id}' references missing option '${rule.optionId}'.`,
          entityType: 'scoring_rule',
          entityId: rule.id,
          severity: 'error',
        }),
      );
      continue;
    }

    if (optionLink.questionId !== question.id) {
      errors.push(
        createIssue({
          code: 'RULE_OPTION_QUESTION_MISMATCH',
          message: `Scoring rule '${rule.id}' option '${rule.optionId}' is not part of question '${rule.questionId}'.`,
          entityType: 'scoring_rule',
          entityId: rule.id,
          severity: 'error',
        }),
      );
    }

    for (const impact of rule.impacts) {
      if (!dimensionByKey.has(impact.dimensionKey)) {
        errors.push(
          createIssue({
            code: 'RULE_MISSING_DIMENSION',
            message: `Scoring rule '${rule.id}' references missing dimension '${impact.dimensionKey}'.`,
            entityType: 'scoring_rule',
            entityId: rule.id,
            severity: 'error',
          }),
        );
        continue;
      }

      usedDimensionKeys.add(impact.dimensionKey);
    }

    const questionOptionKey = `${rule.questionId}:${rule.optionId}`;
    rulesByQuestionOption.set(questionOptionKey, (rulesByQuestionOption.get(questionOptionKey) ?? 0) + 1);
  }

  for (const question of assessmentVersion.questions) {
    if (question.options.length === 0) {
      errors.push(
        createIssue({
          code: 'QUESTION_WITHOUT_OPTIONS',
          message: `Question '${question.id}' has no options.`,
          entityType: 'question',
          entityId: question.id,
          severity: 'error',
        }),
      );
      continue;
    }

    const duplicateOptionOrders = [...countBy(question.options, (option) => `${option.order}`)].filter(
      ([, count]) => count > 1,
    );
    for (const [order] of duplicateOptionOrders) {
      errors.push(
        createIssue({
          code: 'DUPLICATE_OPTION_ORDER',
          message: `Option order '${order}' is duplicated in question '${question.id}'.`,
          entityType: 'option',
          entityId: null,
          severity: 'error',
        }),
      );
    }

    let coveredOptionCount = 0;

    for (const option of question.options) {
      const isCovered = (rulesByQuestionOption.get(`${question.id}:${option.id}`) ?? 0) > 0;
      if (!isCovered) {
        errors.push(
          createIssue({
            code: 'OPTION_WITHOUT_SCORING_COVERAGE',
            message: `Option '${option.id}' has no scoring rule coverage.`,
            entityType: 'option',
            entityId: option.id,
            severity: 'error',
          }),
        );
      } else {
        coveredOptionCount += 1;
      }
    }

    if (!hasBalancedCoverage(question.options.length, coveredOptionCount)) {
      warnings.push(
        createIssue({
          code: 'UNBALANCED_SCORING_COVERAGE',
          message: `Question '${question.id}' has unbalanced scoring coverage across options.`,
          entityType: 'question',
          entityId: question.id,
          severity: 'warning',
        }),
      );
    }
  }

  for (const dimension of assessmentVersion.dimensions) {
    if (!usedDimensionKeys.has(dimension.key)) {
      warnings.push(
        createIssue({
          code: 'UNUSED_DIMENSION',
          message: `Dimension '${dimension.key}' is not used by any scoring rule.`,
          entityType: 'dimension',
          entityId: dimension.id,
          severity: 'warning',
        }),
      );
    }
  }

  if (assessmentVersion.questions.length > 0 && assessmentVersion.questions.length < MIN_RECOMMENDED_QUESTION_COUNT) {
    warnings.push(
      createIssue({
        code: 'LOW_QUESTION_COUNT',
        message: `Version has ${assessmentVersion.questions.length} questions; recommended minimum is ${MIN_RECOMMENDED_QUESTION_COUNT}.`,
        entityType: 'assessment_version',
        entityId: assessmentVersion.id,
        severity: 'warning',
      }),
    );
  }

  for (const rule of assessmentVersion.scoringRules) {
    const question = questionById.get(rule.questionId);
    const optionLink = optionById.get(rule.optionId);

    if (!question || !optionLink || optionLink.questionId !== question.id) {
      warnings.push(
        createIssue({
          code: 'ORPHANED_SCORING_RULE',
          message: `Scoring rule '${rule.id}' points to entities that are no longer active in this version.`,
          entityType: 'scoring_rule',
          entityId: rule.id,
          severity: 'warning',
        }),
      );
    }
  }

  return {
    isPublishable: errors.length === 0,
    errors,
    warnings,
  };
};
