import type {
  AssessmentReadRepository,
  AssessmentSessionRepository,
  ResponseRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

export class SubmitResponsesValidationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'SubmitResponsesValidationError';
    this.statusCode = statusCode;
  }
}

export const submitResponses = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
    responseRepository: ResponseRepository;
    logger?: {
      error: (payload: Record<string, unknown>, message?: string) => void;
    };
  },
  input: {
    sessionId: UUID;
    responses: Array<{
      sessionId: UUID;
      questionId: UUID;
      selectedOptionIds: UUID[];
      value: number | string | null;
    }>;
  },
) => {
  const session = await deps.assessmentSessionRepository.getSession(input.sessionId);
  if (!session) {
    throw new SubmitResponsesValidationError('Session not found', 404);
  }

  if (session.status !== 'in_progress') {
    throw new SubmitResponsesValidationError('Cannot submit responses to a completed session');
  }

  const assessmentVersion = await deps.assessmentReadRepository.getVersion(session.assessmentVersionId);
  if (!assessmentVersion) {
    throw new SubmitResponsesValidationError('Assessment version not found for session');
  }

  const questionById = new Map(
    assessmentVersion.questions.map((question) => [question.id, question] as const),
  );
  const scoringRuleKeySet = new Set(
    assessmentVersion.scoringRules.map((rule) => `${rule.questionId}:${rule.optionId}`),
  );

  input.responses.forEach((response) => {
    const question = questionById.get(response.questionId);
    const questionExists = question !== undefined;
    const optionIdsExistForQuestion = questionExists
      ? response.selectedOptionIds.every((selectedOptionId) =>
          question.options.some((option) => option.id === selectedOptionId),
        )
      : false;

    if (!questionExists || !optionIdsExistForQuestion) {
      deps.logger?.error(
        {
          sessionId: input.sessionId,
          questionId: response.questionId,
          selectedOptionIds: response.selectedOptionIds,
          questionExists,
          optionIdsExistForQuestion,
        },
        'submitResponses input validation failed',
      );
      throw new SubmitResponsesValidationError(
        !questionExists
          ? `Question ${response.questionId} does not exist for this assessment version`
          : `One or more selectedOptionIds are invalid for question ${response.questionId}`,
      );
    }

    const missingRuleOptionIds = response.selectedOptionIds.filter(
      (selectedOptionId) => !scoringRuleKeySet.has(`${response.questionId}:${selectedOptionId}`),
    );

    if (missingRuleOptionIds.length > 0) {
      deps.logger?.error(
        {
          sessionId: input.sessionId,
          questionId: response.questionId,
          selectedOptionIds: response.selectedOptionIds,
          questionExists,
          optionIdsExistForQuestion,
          missingRuleOptionIds,
        },
        'submitResponses scoring rule validation failed',
      );
      throw new SubmitResponsesValidationError(
        `Scoring rule not found for one or more selected options on question ${response.questionId}`,
      );
    }
  });

  // TODO: Validate value by question type (scale/text rules) once richer validation is introduced.
  await deps.responseRepository.upsertResponses(input.sessionId, input.responses);

  return { accepted: true, receivedCount: input.responses.length };
};
