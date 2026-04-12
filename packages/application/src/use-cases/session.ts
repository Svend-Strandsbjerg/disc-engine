import type {
  AssessmentReadRepository,
  AssessmentSessionRepository,
} from '../ports/repositories.js';
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

  // TODO: Add tenant/access checks when auth and multi-tenant context are introduced.
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
