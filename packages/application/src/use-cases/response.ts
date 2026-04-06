import type {
  AssessmentSessionRepository,
  ResponseRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-engine/shared';

export const submitResponses = async (
  deps: {
    assessmentSessionRepository: AssessmentSessionRepository;
    responseRepository: ResponseRepository;
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
    throw new Error('Session not found');
  }

  if (session.status !== 'in_progress') {
    throw new Error('Cannot submit responses to a completed session');
  }

  // TODO: Validate value by question type (scale/text rules) once richer validation is introduced.
  await deps.responseRepository.upsertResponses(input.sessionId, input.responses);

  return { accepted: true, receivedCount: input.responses.length };
};
