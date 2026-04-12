import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  calculateResult,
  completeSession,
  getSessionResult,
  getSessionScoringDebug,
} from '@disc-foundation/application';

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

export const registerResultRoutes = (app: FastifyInstance) => {
  app.get('/sessions/:sessionId/result', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);

    try {
      const result = await getSessionResult(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
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
      if (error instanceof Error && error.message === 'Assessment version not found') {
        return reply.code(404).send({ message: 'Assessment version not found' });
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

  app.post('/sessions/:sessionId/complete', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);

    try {
      const completion = await completeSession(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentSessionRepository: app.repositories.assessmentSessionRepository,
          responseRepository: app.repositories.responseRepository,
          resultRepository: app.repositories.resultRepository,
        },
        params.sessionId,
      );

      return reply.send(completion);
    } catch (error) {
      if (error instanceof Error && error.message === 'Session not found') {
        return reply.code(404).send({ message: 'Session not found' });
      }
      if (error instanceof Error && error.message === 'Assessment version not found') {
        return reply.code(404).send({ message: 'Assessment version not found' });
      }
      if (error instanceof Error && error.message === 'Completed session result is unavailable') {
        return reply.code(409).send({ message: 'Session is completed but result is unavailable' });
      }

      throw error;
    }
  });

  app.get('/internal/sessions/:sessionId/scoring-debug', async (request, reply) => {
    if (process.env.INTERNAL_SCORING_DEBUG_ENABLED !== 'true') {
      return reply.code(404).send({ message: 'Not found' });
    }

    const params = sessionParamsSchema.parse(request.params);

    try {
      const debug = await getSessionScoringDebug(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentSessionRepository: app.repositories.assessmentSessionRepository,
          responseRepository: app.repositories.responseRepository,
        },
        params.sessionId,
      );

      return reply.send(debug);
    } catch (error) {
      if (error instanceof Error && error.message === 'Session not found') {
        return reply.code(404).send({ message: 'Session not found' });
      }

      if (error instanceof Error && error.message === 'Assessment version not found') {
        return reply.code(404).send({ message: 'Assessment version not found' });
      }

      throw error;
    }
  });
};
