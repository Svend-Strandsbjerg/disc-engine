import type {
  AssessmentReadRepository,
  AssessmentSessionRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-engine/shared';

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
    metadata: input.metadata,
  });
};

export const getSession = async (
  deps: { assessmentSessionRepository: AssessmentSessionRepository },
  sessionId: UUID,
) => {
  return deps.assessmentSessionRepository.getSessionSummary(sessionId);
};
