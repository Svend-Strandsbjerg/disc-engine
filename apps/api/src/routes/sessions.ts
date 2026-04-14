import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSession, getSession, getSessionQuestions } from '@disc-foundation/application';

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

  app.get('/sessions/:sessionId/questions', async (request, reply) => {
    const params = sessionParamsSchema.parse(request.params);

    try {
      const questions = await getSessionQuestions(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentSessionRepository: app.repositories.assessmentSessionRepository,
        },
        params.sessionId,
      );

      return reply.send(questions);
    } catch (error) {
      if (error instanceof Error && error.message === 'Session not found') {
        return reply.code(404).send({ message: 'Session not found' });
      }

      if (error instanceof Error && error.message === 'Session assessment version not found') {
        return reply.code(409).send({ message: 'Session assessment version not found' });
      }
      if (error instanceof Error && error.message === 'Session assessment questions not found') {
        return reply.code(409).send({ message: 'Session assessment questions not found' });
      }

      throw error;
    }
  });
};
