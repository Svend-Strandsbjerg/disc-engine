import type { FastifyInstance } from 'fastify';
import { calculateResult } from '@disc-engine/application';

export const registerResultRoutes = (app: FastifyInstance) => {
  app.post('/sessions/:sessionId/calculate-result', async (request, reply) => {
    const params = request.params as { sessionId: string };

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
