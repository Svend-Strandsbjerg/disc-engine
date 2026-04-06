import type {
  ResultQueryRepository,
  ResultReadModel,
  SessionDetailReadModel,
} from '@disc-foundation/application';
import type { UUID } from '@disc-foundation/shared';
import { prisma } from '../services/prisma.js';
import { getAccessContext } from '../services/access-context.js';

const resultInclude = {
  session: {
    include: {
      assessmentDefinition: true,
      assessmentVersion: true,
    },
  },
} as const;

const toResultDto = (row: any): ResultReadModel => {
  const auditTrail = (row.auditTrail ?? []) as Array<{ type?: string }>;
  const eventTypes = [...new Set(auditTrail.map((event) => event.type).filter(Boolean) as string[])];

  return {
    resultId: row.id,
    sessionId: row.sessionId,
    assessmentDefinitionId: row.session.assessmentDefinitionId,
    assessmentVersionId: row.assessmentVersionId,
    scoringVersion: row.scoringVersion,
    status: row.session.status,
    calculatedAt: row.calculatedAt,
    scoreBreakdown: row.scoreBreakdown as ResultReadModel['scoreBreakdown'],
    totalScores: row.totalScores as ResultReadModel['totalScores'],
    rawResponsesSnapshot: row.rawResponsesSnapshot as ResultReadModel['rawResponsesSnapshot'],
    auditTrailSummary: {
      eventCount: auditTrail.length,
      eventTypes,
    },
    sessionTimestamps: {
      startedAt: row.session.startedAt,
      ...(row.session.completedAt ? { completedAt: row.session.completedAt } : {}),
    },
  };
};

const collectDimensionKeys = (items: ResultReadModel[]): string[] => {
  return [...new Set(items.flatMap((item) => item.scoreBreakdown.map((entry) => entry.dimensionKey)))].sort();
};

export class PrismaResultQueryRepository implements ResultQueryRepository {
  async getResultById(resultId: UUID): Promise<ResultReadModel | null> {
    const tenantId = getAccessContext().tenantId;
    const row = await prisma.profileResult.findFirst({
      where: { id: resultId, tenantId },
      include: resultInclude,
    });

    return row ? toResultDto(row) : null;
  }

  async getResultBySessionId(sessionId: UUID): Promise<ResultReadModel | null> {
    const tenantId = getAccessContext().tenantId;
    const row = await prisma.profileResult.findFirst({
      where: { sessionId, tenantId },
      include: resultInclude,
    });

    return row ? toResultDto(row) : null;
  }

  async getSessionDetail(sessionId: UUID): Promise<SessionDetailReadModel | null> {
    const tenantId = getAccessContext().tenantId;
    const session = await prisma.assessmentSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        assessmentDefinition: true,
        assessmentVersion: true,
        responses: { orderBy: { createdAt: 'asc' } },
        result: true,
      },
    });

    if (!session) {
      return null;
    }

    return {
      session: {
        id: session.id,
        status: session.status,
        startedAt: session.startedAt,
        ...(session.completedAt ? { completedAt: session.completedAt } : {}),
        ...(session.metadata ? { metadata: session.metadata as Record<string, unknown> } : {}),
      },
      assessment: {
        definitionId: session.assessmentDefinition.id,
        definitionKey: session.assessmentDefinition.key,
        definitionName: session.assessmentDefinition.name,
        versionId: session.assessmentVersion.id,
        versionNumber: session.assessmentVersion.versionNumber,
        scoringVersion: session.assessmentVersion.scoringVersion,
      },
      responses: session.responses.map((response) => ({
        id: response.id,
        sessionId: response.sessionId,
        questionId: response.questionId,
        selectedOptionIds: response.selectedOptionIds,
        value: (response.value as number | string | null) ?? null,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
      })),
      hasResult: Boolean(session.result),
      ...(session.result
        ? {
            resultSummary: {
              resultId: session.result.id,
              profileCode: session.result.profileCode,
              calculatedAt: session.result.calculatedAt,
            },
          }
        : {}),
    };
  }

  async listResultsByAssessmentDefinition(input: {
    assessmentDefinitionId: UUID;
    from?: Date;
    to?: Date;
    sessionStatus?: 'in_progress' | 'completed';
    assessmentVersionId?: UUID;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; items: ResultReadModel[]; dimensionKeys: string[] }> {
    const tenantId = getAccessContext().tenantId;
    const where = {
      tenantId,
      session: {
        assessmentDefinitionId: input.assessmentDefinitionId,
        ...(input.sessionStatus ? { status: input.sessionStatus } : {}),
      },
      ...(input.assessmentVersionId ? { assessmentVersionId: input.assessmentVersionId } : {}),
      ...(input.from || input.to
        ? {
            calculatedAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await prisma.$transaction([
      prisma.profileResult.count({ where }),
      prisma.profileResult.findMany({
        where,
        include: resultInclude,
        orderBy: { calculatedAt: 'desc' },
        take: input.limit ?? 25,
        skip: input.offset ?? 0,
      }),
    ]);

    const items = rows.map((row) => toResultDto(row));
    return { total, items, dimensionKeys: collectDimensionKeys(items) };
  }

  async listResultsByAssessmentVersion(input: {
    assessmentVersionId: UUID;
    from?: Date;
    to?: Date;
    sessionStatus?: 'in_progress' | 'completed';
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; items: ResultReadModel[]; dimensionKeys: string[] }> {
    const tenantId = getAccessContext().tenantId;
    const where = {
      tenantId,
      assessmentVersionId: input.assessmentVersionId,
      ...(input.sessionStatus ? { session: { status: input.sessionStatus } } : {}),
      ...(input.from || input.to
        ? {
            calculatedAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await prisma.$transaction([
      prisma.profileResult.count({ where }),
      prisma.profileResult.findMany({
        where,
        include: resultInclude,
        orderBy: { calculatedAt: 'desc' },
        take: input.limit ?? 25,
        skip: input.offset ?? 0,
      }),
    ]);

    const items = rows.map((row) => toResultDto(row));
    return { total, items, dimensionKeys: collectDimensionKeys(items) };
  }
}
