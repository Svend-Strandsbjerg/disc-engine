import { z } from 'zod';
import type {
  AssessmentReadRepository,
  AssessmentWriteRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-engine/shared';

const assertDraft = async (
  assessmentReadRepository: AssessmentReadRepository,
  assessmentVersionId: UUID,
) => {
  const version = await assessmentReadRepository.getVersion(assessmentVersionId);
  if (!version) {
    throw new Error('Assessment version not found');
  }

  if (version.status !== 'draft') {
    throw new Error('Published versions are immutable');
  }

  return version;
};

const scoreDimensionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const questionSchema = z.object({
  code: z.string().min(1),
  prompt: z.string().min(1),
  type: z.enum(['single_choice', 'multi_choice', 'scale', 'text']),
  order: z.number().int().nonnegative(),
  required: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const optionSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const scoringRuleSchema = z.object({
  questionId: z.string().uuid(),
  optionId: z.string().uuid(),
  impacts: z.array(z.object({ dimensionKey: z.string().min(1), weight: z.number() })).min(1),
});

export const addScoreDimension = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: { assessmentVersionId: UUID; key: string; label: string; order: number },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  return deps.assessmentWriteRepository.addScoreDimension({
    assessmentVersionId: input.assessmentVersionId,
    ...scoreDimensionSchema.parse(input),
  });
};

export const updateScoreDimension = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: { id: UUID; assessmentVersionId: UUID; label?: string; order?: number },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  return deps.assessmentWriteRepository.updateScoreDimension({
    id: input.id,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.order !== undefined ? { order: input.order } : {}),
  });
};

export const removeScoreDimension = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: { id: UUID; assessmentVersionId: UUID },
) => {
  const version = await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  const used = version.scoringRules.some((rule) =>
    rule.impacts.some((impact) =>
      version.dimensions.find((dimension) => dimension.id === input.id)?.key === impact.dimensionKey,
    ),
  );

  if (used) {
    throw new Error('Cannot delete dimension used in scoring rules');
  }

  await deps.assessmentWriteRepository.removeScoreDimension(input.id);
};

export const addQuestion = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: {
    assessmentVersionId: UUID;
    code: string;
    prompt: string;
    type: 'single_choice' | 'multi_choice' | 'scale' | 'text';
    order: number;
    required?: boolean;
    metadata?: Record<string, unknown>;
  },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  const parsed = questionSchema.parse(input);

  return deps.assessmentWriteRepository.addQuestion({
    assessmentVersionId: input.assessmentVersionId,
    code: parsed.code,
    prompt: parsed.prompt,
    type: parsed.type,
    order: parsed.order,
    required: parsed.required,
    metadata: parsed.metadata,
  });
};

export const updateQuestion = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: {
    id: UUID;
    assessmentVersionId: UUID;
    prompt?: string;
    type?: 'single_choice' | 'multi_choice' | 'scale' | 'text';
    order?: number;
    required?: boolean;
    metadata?: Record<string, unknown>;
  },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  return deps.assessmentWriteRepository.updateQuestion({
    id: input.id,
    ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.required !== undefined ? { required: input.required } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  });
};

export const removeQuestion = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: { id: UUID; assessmentVersionId: UUID },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  const hasResponses = await deps.assessmentWriteRepository.questionHasResponses(input.id);
  if (hasResponses) {
    // TODO: Add archival strategy if future requirements need question removal after runtime use.
    throw new Error('Cannot delete question with existing responses');
  }

  await deps.assessmentWriteRepository.removeQuestion(input.id);
};

export const addQuestionOption = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: {
    assessmentVersionId: UUID;
    questionId: UUID;
    code: string;
    label: string;
    order: number;
    metadata?: Record<string, unknown>;
  },
) => {
  const version = await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  if (!version.questions.some((question) => question.id === input.questionId)) {
    throw new Error('Question does not belong to assessment version');
  }

  const parsed = optionSchema.parse(input);
  return deps.assessmentWriteRepository.addQuestionOption({
    questionId: input.questionId,
    code: parsed.code,
    label: parsed.label,
    order: parsed.order,
    metadata: parsed.metadata,
  });
};

export const updateQuestionOption = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: { id: UUID; assessmentVersionId: UUID; label?: string; order?: number; metadata?: Record<string, unknown> },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  return deps.assessmentWriteRepository.updateQuestionOption({
    id: input.id,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  });
};

export const removeQuestionOption = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: { id: UUID; assessmentVersionId: UUID },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  await deps.assessmentWriteRepository.removeQuestionOption(input.id);
};

export const addScoringRule = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: {
    assessmentVersionId: UUID;
    questionId: UUID;
    optionId: UUID;
    impacts: Array<{ dimensionKey: string; weight: number }>;
  },
) => {
  const version = await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  const parsed = scoringRuleSchema.parse(input);

  const question = version.questions.find((entry) => entry.id === parsed.questionId);
  if (!question) {
    throw new Error('Scoring rule question reference not found');
  }

  if (!question.options.some((option) => option.id === parsed.optionId)) {
    throw new Error('Scoring rule option reference not found in question');
  }

  for (const impact of parsed.impacts) {
    if (!version.dimensions.some((dimension) => dimension.key === impact.dimensionKey)) {
      throw new Error(`Scoring rule dimension reference not found: ${impact.dimensionKey}`);
    }
  }

  return deps.assessmentWriteRepository.addScoringRule(parsed);
};

export const updateScoringRule = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: {
    id: UUID;
    assessmentVersionId: UUID;
    questionId?: UUID;
    optionId?: UUID;
    impacts?: Array<{ dimensionKey: string; weight: number }>;
  },
) => {
  const version = await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);

  if (input.impacts) {
    input.impacts.forEach((impact) => {
      if (!version.dimensions.some((dimension) => dimension.key === impact.dimensionKey)) {
        throw new Error(`Scoring rule dimension reference not found: ${impact.dimensionKey}`);
      }
    });
  }

  return deps.assessmentWriteRepository.updateScoringRule({
    id: input.id,
    ...(input.questionId !== undefined ? { questionId: input.questionId } : {}),
    ...(input.optionId !== undefined ? { optionId: input.optionId } : {}),
    ...(input.impacts !== undefined ? { impacts: input.impacts } : {}),
  });
};

export const removeScoringRule = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentWriteRepository: AssessmentWriteRepository;
  },
  input: { id: UUID; assessmentVersionId: UUID },
) => {
  await assertDraft(deps.assessmentReadRepository, input.assessmentVersionId);
  await deps.assessmentWriteRepository.removeScoringRule(input.id);
};
