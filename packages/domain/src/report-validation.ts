import type { ReportTemplate } from './models.js';

export interface ReportTemplateValidationIssue {
  code: string;
  message: string;
  entityType: 'report_template' | 'report_section' | 'interpretation_rule';
  entityId: string | null;
  severity: 'error' | 'warning';
}

export interface ReportTemplateValidationResult {
  isPublishable: boolean;
  errors: ReportTemplateValidationIssue[];
  warnings: ReportTemplateValidationIssue[];
}

export const validateReportTemplateForPublish = (
  template: ReportTemplate,
): ReportTemplateValidationResult => {
  const errors: ReportTemplateValidationIssue[] = [];
  const warnings: ReportTemplateValidationIssue[] = [];

  if (template.sections.length === 0) {
    errors.push({
      code: 'NO_SECTIONS',
      message: 'At least one report section is required before publish.',
      entityType: 'report_template',
      entityId: template.id,
      severity: 'error',
    });
  }

  if (template.interpretationRules.length === 0) {
    errors.push({
      code: 'NO_RULES',
      message: 'At least one interpretation rule is required before publish.',
      entityType: 'report_template',
      entityId: template.id,
      severity: 'error',
    });
  }

  const sectionKeys = new Set<string>();
  for (const section of template.sections) {
    if (sectionKeys.has(section.key)) {
      errors.push({
        code: 'DUPLICATE_SECTION_KEY',
        message: `Section key '${section.key}' is duplicated in this template version.`,
        entityType: 'report_section',
        entityId: section.id,
        severity: 'error',
      });
    }
    sectionKeys.add(section.key);
  }

  const rulesBySection = new Map<string, number>();

  for (const rule of template.interpretationRules) {
    rulesBySection.set(rule.sectionKey, (rulesBySection.get(rule.sectionKey) ?? 0) + 1);

    if (!sectionKeys.has(rule.sectionKey)) {
      errors.push({
        code: 'RULE_SECTION_NOT_FOUND',
        message: `Rule '${rule.id}' references unknown section key '${rule.sectionKey}'.`,
        entityType: 'interpretation_rule',
        entityId: rule.id,
        severity: 'error',
      });
    }

    if (!rule.target.dimensionKeys.length) {
      errors.push({
        code: 'RULE_INVALID_TARGET',
        message: `Rule '${rule.id}' must target at least one dimension key.`,
        entityType: 'interpretation_rule',
        entityId: rule.id,
        severity: 'error',
      });
    }

    const isUnreachableByThreshold =
      (rule.condition.type === 'high' && (rule.condition.minScore ?? 67) > 100) ||
      (rule.condition.type === 'medium' && (rule.condition.minScore ?? 34) > (rule.condition.maxScore ?? 66)) ||
      (rule.condition.type === 'low' && (rule.condition.maxScore ?? 33) < 0);

    if (isUnreachableByThreshold) {
      warnings.push({
        code: 'RULE_UNLIKELY_TO_TRIGGER',
        message: `Rule '${rule.id}' has condition bounds that may never trigger.`,
        entityType: 'interpretation_rule',
        entityId: rule.id,
        severity: 'warning',
      });
    }
  }

  for (const section of template.sections) {
    if ((rulesBySection.get(section.key) ?? 0) === 0) {
      warnings.push({
        code: 'SECTION_WITHOUT_RULES',
        message: `Section '${section.key}' has no interpretation rules.`,
        entityType: 'report_section',
        entityId: section.id,
        severity: 'warning',
      });
    }
  }

  return {
    isPublishable: errors.length === 0,
    errors,
    warnings,
  };
};
