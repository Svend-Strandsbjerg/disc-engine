import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getResultById,
  getResultBySessionId,
  getSessionDetail,
  listResultsByAssessmentDefinition,
  listResultsByAssessmentVersion,
} from '@disc-foundation/application';

const resultParamsSchema = z.object({ resultId: z.string().uuid() });
const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });
const assessmentParamsSchema = z.object({ id: z.string().uuid() });
const versionParamsSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sessionStatus: z.enum(['in_progress', 'completed']).optional(),
  assessmentVersionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const registerReadRoutes = (app: FastifyInstance) => {
  app.get('/results/:resultId', async (request, reply) => {
    const params = resultParamsSchema.parse(request.params);
    const result = await getResultById(
      { resultQueryRepository: app.repositories.resultQueryRepository },
      params.resultId,
    );

    if (!result) {
      return reply.code(404).send({ message: 'Result not found' });
    }

    return reply.send(result);
  });

  app.get('/sessions/:sessionId/result', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);
    const result = await getResultBySessionId(
      { resultQueryRepository: app.repositories.resultQueryRepository },
      params.sessionId,
    );

    if (!result) {
      return reply.code(404).send({ message: 'Session result not found' });
    }

    return reply.send(result);
  });

  app.get('/sessions/:sessionId/detail', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);
    const detail = await getSessionDetail(
      { resultQueryRepository: app.repositories.resultQueryRepository },
      params.sessionId,
    );

    if (!detail) {
      return reply.code(404).send({ message: 'Session not found' });
    }

    return reply.send(detail);
  });

  app.get('/assessments/:id/results', async (request, reply) => {
    const params = assessmentParamsSchema.parse(request.params);
    const query = listQuerySchema.parse(request.query);

    const results = await listResultsByAssessmentDefinition(
      { resultQueryRepository: app.repositories.resultQueryRepository },
      {
        assessmentDefinitionId: params.id,
        ...(query.from ? { from: new Date(query.from) } : {}),
        ...(query.to ? { to: new Date(query.to) } : {}),
        ...(query.sessionStatus !== undefined ? { sessionStatus: query.sessionStatus } : {}),
        ...(query.assessmentVersionId !== undefined ? { assessmentVersionId: query.assessmentVersionId } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.offset !== undefined ? { offset: query.offset } : {}),
      },
    );

    return reply.send(results);
  });

  app.get('/versions/:id/results', async (request, reply) => {
    const params = versionParamsSchema.parse(request.params);
    const query = listQuerySchema
      .omit({ assessmentVersionId: true })
      .parse(request.query as Record<string, unknown>);

    const results = await listResultsByAssessmentVersion(
      { resultQueryRepository: app.repositories.resultQueryRepository },
      {
        assessmentVersionId: params.id,
        ...(query.from ? { from: new Date(query.from) } : {}),
        ...(query.to ? { to: new Date(query.to) } : {}),
        ...(query.sessionStatus !== undefined ? { sessionStatus: query.sessionStatus } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.offset !== undefined ? { offset: query.offset } : {}),
      },
    );

    return reply.send(results);
  });
};
