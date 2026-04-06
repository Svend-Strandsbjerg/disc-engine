// Deprecated runtime adapters kept only for local fallback scenarios.
// Primary runtime persistence now uses Prisma repositories.
import type {
  AssessmentSessionRepository,
  ResponseRepository,
  ResultRepository,
} from '@disc-engine/application';
import type { AssessmentSession, ProfileResult, Response } from '@disc-engine/domain';
import type { UUID } from '@disc-engine/shared';

const sessions = new Map<UUID, AssessmentSession>();
const responses = new Map<UUID, Response[]>();
const results = new Map<UUID, ProfileResult>();

export class InMemoryAssessmentSessionRepository implements AssessmentSessionRepository {
  async createSession(
    input: Pick<AssessmentSession, 'assessmentDefinitionId' | 'assessmentVersionId' | 'metadata'>,
  ): Promise<AssessmentSession> {
    const session: AssessmentSession = {
      id: crypto.randomUUID(),
      assessmentDefinitionId: input.assessmentDefinitionId,
      assessmentVersionId: input.assessmentVersionId,
      status: 'in_progress',
      startedAt: new Date(),
      metadata: input.metadata,
    };
    sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: UUID): Promise<AssessmentSession | null> {
    return sessions.get(sessionId) ?? null;
  }

  async completeSession(sessionId: UUID): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.set(sessionId, { ...session, status: 'completed', completedAt: new Date() });
  }

  async getSessionSummary(sessionId: UUID) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      assessmentDefinitionId: session.assessmentDefinitionId,
      assessmentVersionId: session.assessmentVersionId,
      status: session.status,
      startedAt: session.startedAt,
      ...(session.completedAt ? { completedAt: session.completedAt } : {}),
      responseCount: responses.get(sessionId)?.length ?? 0,
      hasResult: results.has(sessionId),
    };
  }
}

export class InMemoryResponseRepository implements ResponseRepository {
  async upsertResponses(
    sessionId: UUID,
    inputResponses: Omit<Response, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<void> {
    const current = responses.get(sessionId) ?? [];
    const byQuestion = new Map(current.map((response) => [response.questionId, response]));

    inputResponses.forEach((response) => {
      const existing = byQuestion.get(response.questionId);
      const now = new Date();
      byQuestion.set(response.questionId, {
        ...(existing ?? { id: crypto.randomUUID(), createdAt: now }),
        sessionId,
        questionId: response.questionId,
        selectedOptionIds: response.selectedOptionIds,
        value: response.value,
        updatedAt: now,
      });
    });

    responses.set(sessionId, [...byQuestion.values()]);
  }

  async getResponses(sessionId: UUID): Promise<Response[]> {
    return responses.get(sessionId) ?? [];
  }
}

export class InMemoryResultRepository implements ResultRepository {
  async saveResultAndCompleteSession(result: ProfileResult): Promise<void> {
    results.set(result.sessionId, result);
    const session = sessions.get(result.sessionId);
    if (session) {
      sessions.set(result.sessionId, { ...session, status: 'completed', completedAt: result.calculatedAt });
    }
  }

  async getResultBySession(sessionId: UUID): Promise<ProfileResult | null> {
    return results.get(sessionId) ?? null;
  }
}
