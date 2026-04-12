import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calculateResult, getSessionResult } from '@disc-foundation/application';

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

export const registerResultRoutes = (app: FastifyInstance) => {
  app.get('/sessions/:sessionId/result', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);

    try {
      const result = await getSessionResult(
        {
          assessmentSessionRepository: app.repositories.assessmentSessionRepository,
          resultRepository: app.repositories.resultRepository,
        },
        params.sessionId,
      );

      if (!result) {
        return reply.code(409).send({ message: 'Session result has not been computed yet' });
      }

      return reply.send(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Session not found') {
        return reply.code(404).send({ message: 'Session not found' });
      }

      throw error;
    }
  });

  app.post('/sessions/:sessionId/calculate-result', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);

    const result = await calculateResult(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentSessionRepository: app.repositories.assessmentSessionRepository,
        responseRepository: app.repositories.responseRepository,
        resultRepository: app.repositories.resultRepository,
      },
      params.sessionId,
    );

    return reply.send(result);
  });
};
