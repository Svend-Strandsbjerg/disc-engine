import type {
  AssessmentSessionRepository,
  ResponseRepository,
  ResultRepository,
} from '@disc-foundation/application';
import type {
  AssessmentSession,
  ProfileResult,
  Response,
} from '@disc-foundation/domain';
import type { UUID } from '@disc-foundation/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.js';
import { getAccessContext } from '../services/access-context.js';

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const toNullableJsonValue = (value: string | number | null): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue =>
  value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

const mapSession = (session: {
  id: string;
  assessmentDefinitionId: string;
  assessmentVersionId: string;
  status: 'in_progress' | 'completed';
  startedAt: Date;
  completedAt: Date | null;
  metadata: unknown;
}): AssessmentSession => ({
  id: session.id,
  assessmentDefinitionId: session.assessmentDefinitionId,
  assessmentVersionId: session.assessmentVersionId,
  status: session.status,
  startedAt: session.startedAt,
  ...(session.completedAt ? { completedAt: session.completedAt } : {}),
  ...(session.metadata ? { metadata: session.metadata as Record<string, unknown> } : {}),
});

const mapResponse = (response: {
  id: string;
  sessionId: string;
  questionId: string;
  selectedOptionIds: string[];
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Response => ({
  id: response.id,
  sessionId: response.sessionId,
  questionId: response.questionId,
  selectedOptionIds: response.selectedOptionIds,
  value: (response.value as number | string | null) ?? null,
  createdAt: response.createdAt,
  updatedAt: response.updatedAt,
});

export class PrismaAssessmentSessionRepository implements AssessmentSessionRepository {
  async createSession(
    input: Pick<AssessmentSession, 'assessmentDefinitionId' | 'assessmentVersionId' | 'metadata'>,
  ): Promise<AssessmentSession> {
    const tenantId = getAccessContext().tenantId;
    const created = await prisma.$transaction(async (tx) => {
      return tx.assessmentSession.create({
        data: {
          tenantId,
          assessmentDefinitionId: input.assessmentDefinitionId,
          assessmentVersionId: input.assessmentVersionId,
          status: 'in_progress',
          ...(input.metadata !== undefined ? { metadata: toInputJsonValue(input.metadata) } : {}),
        },
      });
    });

    return mapSession(created);
  }

  async getSession(sessionId: UUID): Promise<AssessmentSession | null> {
    const tenantId = getAccessContext().tenantId;
    const session = await prisma.assessmentSession.findFirst({ where: { id: sessionId, tenantId } });
    return session ? mapSession(session) : null;
  }

  async completeSession(sessionId: UUID): Promise<void> {
    const tenantId = getAccessContext().tenantId;
    const session = await prisma.assessmentSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!session) throw new Error('Session not found');
    await prisma.assessmentSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });
  }

  async getSessionSummary(sessionId: UUID): Promise<{
    id: UUID;
    assessmentDefinitionId: UUID;
    assessmentVersionId: UUID;
    status: AssessmentSession['status'];
    startedAt: Date;
    completedAt?: Date;
    responseCount: number;
    hasResult: boolean;
  } | null> {
    const tenantId = getAccessContext().tenantId;
    const session = await prisma.assessmentSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        _count: { select: { responses: true } },
        result: { select: { id: true } },
      },
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      assessmentDefinitionId: session.assessmentDefinitionId,
      assessmentVersionId: session.assessmentVersionId,
      status: session.status,
      startedAt: session.startedAt,
      ...(session.completedAt ? { completedAt: session.completedAt } : {}),
      responseCount: session._count.responses,
      hasResult: Boolean(session.result),
    };
  }
}

export class PrismaResponseRepository implements ResponseRepository {
  async upsertResponses(
    sessionId: UUID,
    inputResponses: Omit<Response, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<void> {
    const tenantId = getAccessContext().tenantId;
    const session = await prisma.assessmentSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!session) throw new Error('Session not found');

    await prisma.$transaction(
      inputResponses.map((response) =>
        prisma.response.upsert({
          where: {
            sessionId_questionId: {
              sessionId,
              questionId: response.questionId,
            },
          },
          update: {
            selectedOptionIds: response.selectedOptionIds,
            value: toNullableJsonValue(response.value),
          },
          create: {
            sessionId,
            questionId: response.questionId,
            selectedOptionIds: response.selectedOptionIds,
            value: toNullableJsonValue(response.value),
          },
        }),
      ),
    );
  }

  async getResponses(sessionId: UUID): Promise<Response[]> {
    const tenantId = getAccessContext().tenantId;
    const rows = await prisma.response.findMany({
      where: { sessionId, session: { tenantId } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapResponse);
  }
}

export class PrismaResultRepository implements ResultRepository {
  async saveResultAndCompleteSession(result: ProfileResult): Promise<void> {
    const tenantId = getAccessContext().tenantId;
    await prisma.$transaction(async (tx) => {
      await tx.profileResult.upsert({
        where: { sessionId: result.sessionId },
        update: {
          assessmentVersionId: result.assessmentVersionId,
          scoringVersion: result.scoringVersion,
          profileCode: result.profileCode,
          summary: result.summary ?? null,
          scoreBreakdown: toInputJsonValue(result.scoreBreakdown),
          totalScores: toInputJsonValue(result.totalScores),
          rawResponsesSnapshot: toInputJsonValue(result.rawResponsesSnapshot),
          auditTrail: toInputJsonValue(result.auditTrail),
          calculatedAt: result.calculatedAt,
        },
        create: {
          id: result.id,
          tenantId,
          sessionId: result.sessionId,
          assessmentVersionId: result.assessmentVersionId,
          scoringVersion: result.scoringVersion,
          profileCode: result.profileCode,
          summary: result.summary ?? null,
          scoreBreakdown: toInputJsonValue(result.scoreBreakdown),
          totalScores: toInputJsonValue(result.totalScores),
          rawResponsesSnapshot: toInputJsonValue(result.rawResponsesSnapshot),
          auditTrail: toInputJsonValue(result.auditTrail),
          calculatedAt: result.calculatedAt,
        },
      });

      await tx.assessmentSession.update({
        where: { id: result.sessionId },
        data: {
          status: 'completed',
          completedAt: result.calculatedAt,
        },
      });
    });
  }

  async getResultBySession(sessionId: UUID): Promise<ProfileResult | null> {
    const tenantId = getAccessContext().tenantId;
    const row = await prisma.profileResult.findFirst({ where: { sessionId, tenantId } });
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      sessionId: row.sessionId,
      assessmentVersionId: row.assessmentVersionId,
      scoringVersion: row.scoringVersion,
      profileCode: row.profileCode,
      ...(row.summary ? { summary: row.summary } : {}),
      scoreBreakdown: row.scoreBreakdown as unknown as ProfileResult['scoreBreakdown'],
      totalScores: row.totalScores as Record<string, number>,
      rawResponsesSnapshot: row.rawResponsesSnapshot as unknown as Response[],
      calculatedAt: row.calculatedAt,
      auditTrail: row.auditTrail as unknown as ProfileResult['auditTrail'],
    };
  }
}
