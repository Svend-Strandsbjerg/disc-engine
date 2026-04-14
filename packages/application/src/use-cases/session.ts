import type {
  AssessmentReadRepository,
  AssessmentSessionRepository,
} from '../ports/repositories.js';
import type { QuestionType } from '@disc-foundation/domain';
import type { UUID } from '@disc-foundation/shared';

export type SessionLifecycleStatus = 'created' | 'awaiting_result' | 'completed';

export const deriveSessionLifecycleStatus = (input: {
  status: 'in_progress' | 'completed';
  responseCount: number;
  hasResult: boolean;
}): SessionLifecycleStatus => {
  if (input.hasResult || input.status === 'completed') {
    return 'completed';
  }

  if (input.responseCount === 0) {
    return 'created';
  }

  return 'awaiting_result';
};

export const createSession = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
  },
  input: { assessmentVersionId: UUID; metadata?: Record<string, unknown> },
) => {
  const version = await deps.assessmentReadRepository.getVersion(input.assessmentVersionId);
  if (!version) {
    throw new Error('Assessment version not found');
  }

  if (!version.immutableAt || version.status !== 'published') {
    throw new Error('Sessions can only be created for published immutable versions');
  }

  return deps.assessmentSessionRepository.createSession({
    assessmentDefinitionId: version.assessmentDefinitionId,
    assessmentVersionId: input.assessmentVersionId,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  });
};

export const getSession = async (
  deps: { assessmentSessionRepository: AssessmentSessionRepository },
  sessionId: UUID,
) => {
  const summary = await deps.assessmentSessionRepository.getSessionSummary(sessionId);
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    lifecycleStatus: deriveSessionLifecycleStatus({
      status: summary.status,
      responseCount: summary.responseCount,
      hasResult: summary.hasResult,
    }),
  };
};

export interface SessionQuestionOptionDto {
  id: UUID;
  label: string;
  order: number;
}

export interface SessionQuestionDto {
  id: UUID;
  prompt: string;
  text: string;
  order: number;
  responseType: QuestionType;
  options?: SessionQuestionOptionDto[];
}

export interface SessionQuestionsDto {
  sessionId: UUID;
  assessmentVersionId: UUID;
  questions: SessionQuestionDto[];
}

const byStableOrder = <T extends { order: number; id: UUID }>(a: T, b: T): number =>
  a.order - b.order || a.id.localeCompare(b.id);

export const getSessionQuestions = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
  },
  sessionId: UUID,
): Promise<SessionQuestionsDto> => {
  const session = await deps.assessmentSessionRepository.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const version = await deps.assessmentReadRepository.getVersion(session.assessmentVersionId);
  if (!version) {
    throw new Error('Session assessment version not found');
  }
  if (version.questions.length === 0) {
    throw new Error('Session assessment questions not found');
  }

  return {
    sessionId: session.id,
    assessmentVersionId: version.id,
    questions: [...version.questions].sort(byStableOrder).map((question) => ({
      id: question.id,
      prompt: question.prompt,
      text: question.prompt,
      order: question.order,
      responseType: question.type,
      ...(question.options.length > 0
        ? {
            options: [...question.options].sort(byStableOrder).map((option) => ({
              id: option.id,
              label: option.label,
              order: option.order,
            })),
          }
        : {}),
    })),
  };
};
