import { z } from 'zod';
import type {
  ReportTemplateReadRepository,
  ReportTemplateWriteRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

const assertDraftTemplate = async (
  repo: ReportTemplateReadRepository,
  templateVersionId: UUID,
) => {
  const template = await repo.getTemplateVersion(templateVersionId);
  if (!template) {
    throw new Error('Report template version not found');
  }

  if (template.status !== 'draft' || template.immutableAt) {
    throw new Error('Published templates are immutable');
  }

  return template;
};

const sectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const ruleSchema = z.object({
  sectionKey: z.string().min(1),
  target: z.object({
    type: z.enum(['dimension', 'combination']),
    dimensionKeys: z.array(z.string().min(1)).min(1),
  }),
  condition: z.object({
    type: z.enum(['high', 'medium', 'low', 'top_dimension', 'lowest_dimension']),
    minScore: z.number().optional(),
    maxScore: z.number().optional(),
  }),
  output: z.string().min(1),
  priority: z.number().int(),
});

export const addReportSection = async (
  deps: {
    reportTemplateReadRepository: ReportTemplateReadRepository;
    reportTemplateWriteRepository: ReportTemplateWriteRepository;
  },
  input: { templateId: UUID; key: string; title: string; order: number },
) => {
  await assertDraftTemplate(deps.reportTemplateReadRepository, input.templateId);
  return deps.reportTemplateWriteRepository.addReportSection({
    templateId: input.templateId,
    ...sectionSchema.parse(input),
  });
};

export const updateReportSection = async (
  deps: {
    reportTemplateReadRepository: ReportTemplateReadRepository;
    reportTemplateWriteRepository: ReportTemplateWriteRepository;
  },
  input: { id: UUID; templateId: UUID; title?: string; order?: number },
) => {
  await assertDraftTemplate(deps.reportTemplateReadRepository, input.templateId);
  return deps.reportTemplateWriteRepository.updateReportSection({
    id: input.id,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.order !== undefined ? { order: input.order } : {}),
  });
};

export const removeReportSection = async (
  deps: {
    reportTemplateReadRepository: ReportTemplateReadRepository;
    reportTemplateWriteRepository: ReportTemplateWriteRepository;
  },
  input: { id: UUID; templateId: UUID },
) => {
  await assertDraftTemplate(deps.reportTemplateReadRepository, input.templateId);
  await deps.reportTemplateWriteRepository.removeReportSection(input.id);
};

export const addInterpretationRule = async (
  deps: {
    reportTemplateReadRepository: ReportTemplateReadRepository;
    reportTemplateWriteRepository: ReportTemplateWriteRepository;
  },
  input: {
    templateId: UUID;
    sectionKey: string;
    target: { type: 'dimension' | 'combination'; dimensionKeys: string[] };
    condition: { type: 'high' | 'medium' | 'low' | 'top_dimension' | 'lowest_dimension'; minScore?: number; maxScore?: number };
    output: string;
    priority: number;
  },
) => {
  const template = await assertDraftTemplate(deps.reportTemplateReadRepository, input.templateId);
  const parsed = ruleSchema.parse(input);

  if (!template.sections.some((section) => section.key === parsed.sectionKey)) {
    throw new Error('Interpretation rule references unknown section key');
  }

  return deps.reportTemplateWriteRepository.addInterpretationRule({
    templateId: input.templateId,
    ...parsed,
  });
};

export const updateInterpretationRule = async (
  deps: {
    reportTemplateReadRepository: ReportTemplateReadRepository;
    reportTemplateWriteRepository: ReportTemplateWriteRepository;
  },
  input: {
    id: UUID;
    templateId: UUID;
    sectionKey?: string;
    target?: { type: 'dimension' | 'combination'; dimensionKeys: string[] };
    condition?: { type: 'high' | 'medium' | 'low' | 'top_dimension' | 'lowest_dimension'; minScore?: number; maxScore?: number };
    output?: string;
    priority?: number;
  },
) => {
  const template = await assertDraftTemplate(deps.reportTemplateReadRepository, input.templateId);
  if (input.sectionKey && !template.sections.some((section) => section.key === input.sectionKey)) {
    throw new Error('Interpretation rule references unknown section key');
  }

  return deps.reportTemplateWriteRepository.updateInterpretationRule({
    id: input.id,
    ...(input.sectionKey !== undefined ? { sectionKey: input.sectionKey } : {}),
    ...(input.target !== undefined ? { target: input.target } : {}),
    ...(input.condition !== undefined ? { condition: input.condition } : {}),
    ...(input.output !== undefined ? { output: input.output } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
  });
};

export const removeInterpretationRule = async (
  deps: {
    reportTemplateReadRepository: ReportTemplateReadRepository;
    reportTemplateWriteRepository: ReportTemplateWriteRepository;
  },
  input: { id: UUID; templateId: UUID },
) => {
  await assertDraftTemplate(deps.reportTemplateReadRepository, input.templateId);
  await deps.reportTemplateWriteRepository.removeInterpretationRule(input.id);
};
