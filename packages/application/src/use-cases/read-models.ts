import type { ResultQueryRepository } from '../ports/repositories.js';
import type { UUID } from '@disc-engine/shared';

export const getResultById = async (
  deps: { resultQueryRepository: ResultQueryRepository },
  resultId: UUID,
) => {
  return deps.resultQueryRepository.getResultById(resultId);
};

export const getResultBySessionId = async (
  deps: { resultQueryRepository: ResultQueryRepository },
  sessionId: UUID,
) => {
  return deps.resultQueryRepository.getResultBySessionId(sessionId);
};

export const getSessionDetail = async (
  deps: { resultQueryRepository: ResultQueryRepository },
  sessionId: UUID,
) => {
  return deps.resultQueryRepository.getSessionDetail(sessionId);
};

export const listResultsByAssessmentDefinition = async (
  deps: { resultQueryRepository: ResultQueryRepository },
  input: {
    assessmentDefinitionId: UUID;
    from?: Date;
    to?: Date;
    sessionStatus?: 'in_progress' | 'completed';
    assessmentVersionId?: UUID;
    limit?: number;
    offset?: number;
  },
) => {
  return deps.resultQueryRepository.listResultsByAssessmentDefinition(input);
};

export const listResultsByAssessmentVersion = async (
  deps: { resultQueryRepository: ResultQueryRepository },
  input: {
    assessmentVersionId: UUID;
    from?: Date;
    to?: Date;
    sessionStatus?: 'in_progress' | 'completed';
    limit?: number;
    offset?: number;
  },
) => {
  return deps.resultQueryRepository.listResultsByAssessmentVersion(input);
};
