import {
  createDefaultScoringEngine,
  type ProfileResult,
  type ScoringEngine,
} from '@disc-foundation/domain';
import type {
  AssessmentReadRepository,
  AssessmentSessionRepository,
  ResponseRepository,
  ResultRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';

export const calculateResult = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
    responseRepository: ResponseRepository;
    resultRepository: ResultRepository;
    scoringEngine?: ScoringEngine;
  },
  sessionId: UUID,
): Promise<ProfileResult> => {
  const session = await deps.assessmentSessionRepository.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'in_progress') {
    throw new Error('Session is already completed');
  }

  const version = await deps.assessmentReadRepository.getVersion(session.assessmentVersionId);
  if (!version) {
    throw new Error('Assessment version not found');
  }

  const responses = await deps.responseRepository.getResponses(sessionId);

  const engine = deps.scoringEngine ?? createDefaultScoringEngine();
  const result = engine.calculate({ assessmentVersion: version, responses });

  await deps.resultRepository.saveResultAndCompleteSession(result);
  return result;
};
