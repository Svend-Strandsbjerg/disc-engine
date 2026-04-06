import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { submitResponses } from '@disc-engine/application';

const submitResponsesSchema = z
  .object({
    sessionId: z.string().uuid(),
    responses: z.array(
      z.object({
        sessionId: z.string().uuid(),
        questionId: z.string().uuid(),
        selectedOptionIds: z.array(z.string().uuid()).default([]),
        value: z.union([z.number(), z.string(), z.null()]).default(null),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    value.responses.forEach((response, index) => {
      if (response.sessionId !== value.sessionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'response.sessionId must match request sessionId',
          path: ['responses', index, 'sessionId'],
        });
      }
    });
  });

export const registerResponseRoutes = (app: FastifyInstance) => {
  app.post('/responses', async (request, reply) => {
    const body = submitResponsesSchema.parse(request.body);

    const result = await submitResponses(
      {
        assessmentSessionRepository: app.repositories.assessmentSessionRepository,
        responseRepository: app.repositories.responseRepository,
      },
      body,
    );

    return reply.code(202).send(result);
  });
};
