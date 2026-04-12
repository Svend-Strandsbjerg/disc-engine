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

export interface SessionResultDto {
  sessionId: UUID;
  assessmentVersionId: UUID;
  scoringVersion: string;
  completedAt: Date;
  scores: {
    raw: {
      D: number;
      I: number;
      S: number;
      C: number;
    };
    normalized: {
      D: number;
      I: number;
      S: number;
      C: number;
    };
  };
  primaryDimension: 'D' | 'I' | 'S' | 'C';
  secondaryDimension: 'D' | 'I' | 'S' | 'C';
}

const discDimensions = ['D', 'I', 'S', 'C'] as const;

const toDiscScores = (
  result: ProfileResult,
): Pick<SessionResultDto, 'scores' | 'primaryDimension' | 'secondaryDimension'> => {
  const byDimension = new Map(
    result.scoreBreakdown.map((item) => [item.dimensionKey.toUpperCase(), item] as const),
  );

  const raw = {
    D: byDimension.get('D')?.rawScore ?? 0,
    I: byDimension.get('I')?.rawScore ?? 0,
    S: byDimension.get('S')?.rawScore ?? 0,
    C: byDimension.get('C')?.rawScore ?? 0,
  };

  const normalized = {
    D: byDimension.get('D')?.normalizedScore ?? 0,
    I: byDimension.get('I')?.normalizedScore ?? 0,
    S: byDimension.get('S')?.normalizedScore ?? 0,
    C: byDimension.get('C')?.normalizedScore ?? 0,
  };

  const ranked = [...discDimensions]
    .map((dimension) => ({ dimension, score: normalized[dimension] }))
    .sort((a, b) => b.score - a.score || a.dimension.localeCompare(b.dimension));

  return {
    scores: { raw, normalized },
    primaryDimension: ranked[0]?.dimension ?? 'D',
    secondaryDimension: ranked[1]?.dimension ?? ranked[0]?.dimension ?? 'I',
  };
};

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

export const getSessionResult = async (
  deps: {
    assessmentSessionRepository: AssessmentSessionRepository;
    resultRepository: ResultRepository;
  },
  sessionId: UUID,
): Promise<SessionResultDto | null> => {
  const session = await deps.assessmentSessionRepository.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const result = await deps.resultRepository.getResultBySession(sessionId);
  if (!result) {
    return null;
  }

  const discScores = toDiscScores(result);

  return {
    sessionId: result.sessionId,
    assessmentVersionId: session.assessmentVersionId,
    scoringVersion: result.scoringVersion,
    completedAt: result.calculatedAt,
    ...discScores,
  };
};
