import { z } from 'zod';
import {
  validateReportTemplateForPublish,
  type ReportTemplateValidationResult,
} from '@disc-foundation/domain';
import type {
  ReportTemplateReadRepository,
  ReportTemplateWriteRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

const createTemplateDefinitionSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

const createTemplateVersionSchema = z.object({
  reportTemplateDefinitionId: z.string().uuid(),
  templateVersion: z.string().min(1),
  linkedAssessmentVersionId: z.string().uuid().optional(),
});

const cloneTemplateVersionSchema = z.object({
  sourceTemplateVersionId: z.string().uuid(),
  templateVersion: z.string().min(1),
});

export interface PublishReportTemplateVersionResult {
  published: boolean;
  validation: ReportTemplateValidationResult;
  templateVersion: Awaited<ReturnType<ReportTemplateWriteRepository['publishReportTemplateVersion']>> | null;
}

export const createReportTemplate = async (
  deps: { reportTemplateWriteRepository: ReportTemplateWriteRepository },
  input: { key: string; name: string; description?: string },
) => {
  const parsed = createTemplateDefinitionSchema.parse(input);
  return deps.reportTemplateWriteRepository.createReportTemplateDefinition({
    key: parsed.key,
    name: parsed.name,
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
  });
};

export const createReportTemplateVersion = async (
  deps: { reportTemplateWriteRepository: ReportTemplateWriteRepository },
  input: { reportTemplateDefinitionId: UUID; templateVersion: string; linkedAssessmentVersionId?: UUID },
) => {
  const parsed = createTemplateVersionSchema.parse(input);
  return deps.reportTemplateWriteRepository.createReportTemplateVersionDraft({
    reportTemplateDefinitionId: parsed.reportTemplateDefinitionId,
    templateVersion: parsed.templateVersion,
    ...(parsed.linkedAssessmentVersionId !== undefined
      ? { linkedAssessmentVersionId: parsed.linkedAssessmentVersionId }
      : {}),
  });
};

export const cloneReportTemplateVersion = async (
  deps: { reportTemplateWriteRepository: ReportTemplateWriteRepository },
  input: { sourceTemplateVersionId: UUID; templateVersion: string },
) => {
  return deps.reportTemplateWriteRepository.cloneReportTemplateVersion(
    cloneTemplateVersionSchema.parse(input),
  );
};

export const getReportTemplateVersionById = async (
  deps: { reportTemplateReadRepository: ReportTemplateReadRepository },
  templateVersionId: UUID,
) => {
  return deps.reportTemplateReadRepository.getTemplateVersion(templateVersionId);
};

export const getActiveReportTemplateVersion = async (
  deps: { reportTemplateReadRepository: ReportTemplateReadRepository },
  reportTemplateDefinitionId: UUID,
) => {
  return deps.reportTemplateReadRepository.getActiveTemplateVersion(reportTemplateDefinitionId);
};

export const validateReportTemplateVersion = async (
  deps: { reportTemplateReadRepository: ReportTemplateReadRepository },
  templateVersionId: UUID,
): Promise<ReportTemplateValidationResult> => {
  const template = await deps.reportTemplateReadRepository.getTemplateVersion(templateVersionId);
  if (!template) {
    throw new Error('Report template version not found');
  }

  return validateReportTemplateForPublish(template);
};

export const publishReportTemplateVersion = async (
  deps: {
    reportTemplateReadRepository: ReportTemplateReadRepository;
    reportTemplateWriteRepository: ReportTemplateWriteRepository;
  },
  templateVersionId: UUID,
): Promise<PublishReportTemplateVersionResult> => {
  const template = await deps.reportTemplateReadRepository.getTemplateVersion(templateVersionId);
  if (!template) {
    throw new Error('Report template version not found');
  }

  const validation = validateReportTemplateForPublish(template);
  if (!validation.isPublishable) {
    return {
      published: false,
      validation,
      templateVersion: null,
    };
  }

  const published = await deps.reportTemplateWriteRepository.publishReportTemplateVersion(templateVersionId);

  return {
    published: true,
    validation,
    templateVersion: published,
  };
};
