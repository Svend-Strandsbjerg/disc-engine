import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SubmitResponsesValidationError, submitResponses } from '@disc-foundation/application';

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
    const parseResult = submitResponsesSchema.safeParse(request.body);
    if (!parseResult.success) {
      const maybeBody = request.body as Partial<{
        sessionId: string;
        responses: Array<{
          questionId: string;
          selectedOptionIds: string[];
        }>;
      }>;
      const firstResponse = maybeBody.responses?.[0];
      app.log.error(
        {
          sessionId: maybeBody.sessionId,
          questionId: firstResponse?.questionId,
          selectedOptionIds: firstResponse?.selectedOptionIds,
          questionExists: null,
          optionIdsExistForQuestion: null,
          issues: parseResult.error.issues,
        },
        'submitResponses request body parsing failed',
      );
      return reply.code(400).send({
        message: 'Invalid request body',
        issues: parseResult.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }

    const body = parseResult.data;

    try {
      const result = await submitResponses(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentSessionRepository: app.repositories.assessmentSessionRepository,
          responseRepository: app.repositories.responseRepository,
          logger: app.log,
        },
        body,
      );

      return reply.code(202).send(result);
    } catch (error) {
      if (error instanceof SubmitResponsesValidationError) {
        const firstResponse = body.responses[0];
        app.log.error(
          {
            sessionId: body.sessionId,
            questionId: firstResponse?.questionId,
            selectedOptionIds: firstResponse?.selectedOptionIds,
            questionExists: null,
            optionIdsExistForQuestion: null,
            error: error.message,
          },
          'submitResponses validation failed',
        );
        return reply.code(error.statusCode).send({ message: error.message });
      }

      throw error;
    }
  });
};
