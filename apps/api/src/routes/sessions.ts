import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSession, getSession } from '@disc-foundation/application';

const createSessionSchema = z.object({
  assessmentVersionId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

export const registerSessionRoutes = (app: FastifyInstance) => {
  app.post('/sessions', async (request, reply) => {
    const body = createSessionSchema.parse(request.body);

    const session = await createSession(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentSessionRepository: app.repositories.assessmentSessionRepository,
      },
      {
        assessmentVersionId: body.assessmentVersionId,
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      },
    );

    return reply.code(201).send(session);
  });

  app.get('/sessions/:sessionId', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);
    const session = await getSession(
      { assessmentSessionRepository: app.repositories.assessmentSessionRepository },
      params.sessionId,
    );

    if (!session) {
      return reply.code(404).send({ message: 'Session not found' });
    }

    return reply.send(session);
  });
};
