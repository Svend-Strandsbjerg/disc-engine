import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addQuestion,
  addQuestionOption,
  addScoreDimension,
  addScoringRule,
  removeQuestion,
  removeQuestionOption,
  removeScoreDimension,
  removeScoringRule,
  updateQuestion,
  updateQuestionOption,
  updateScoreDimension,
  updateScoringRule,
} from '@disc-foundation/application';

const versionParams = z.object({ id: z.string().uuid() });
const entityParams = z.object({ id: z.string().uuid() });

export const registerVersionEditingRoutes = (app: FastifyInstance) => {
  app.post('/versions/:id/dimensions', async (request, reply) => {
    const params = versionParams.parse(request.params);
    const body = z
      .object({ key: z.string().min(1), label: z.string().min(1), order: z.number().int().nonnegative() })
      .parse(request.body);

    const created = await addScoreDimension(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { assessmentVersionId: params.id, ...body },
    );

    return reply.code(201).send(created);
  });

  app.patch('/dimensions/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const body = z
      .object({ assessmentVersionId: z.string().uuid(), label: z.string().optional(), order: z.number().int().optional() })
      .parse(request.body);

    return reply.send(
      await updateScoreDimension(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentWriteRepository: app.repositories.assessmentWriteRepository,
        },
        { id: params.id, ...body },
      ),
    );
  });

  app.delete('/dimensions/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const query = z.object({ assessmentVersionId: z.string().uuid() }).parse(request.query);

    await removeScoreDimension(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { id: params.id, assessmentVersionId: query.assessmentVersionId },
    );

    return reply.code(204).send();
  });

  app.post('/versions/:id/questions', async (request, reply) => {
    const params = versionParams.parse(request.params);
    const body = z
      .object({
        code: z.string().min(1),
        prompt: z.string().min(1),
        type: z.enum(['single_choice', 'multi_choice', 'scale', 'text']),
        order: z.number().int().nonnegative(),
        required: z.boolean().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);

    const created = await addQuestion(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { assessmentVersionId: params.id, ...body },
    );

    return reply.code(201).send(created);
  });

  app.patch('/questions/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const body = z
      .object({
        assessmentVersionId: z.string().uuid(),
        prompt: z.string().optional(),
        type: z.enum(['single_choice', 'multi_choice', 'scale', 'text']).optional(),
        order: z.number().int().optional(),
        required: z.boolean().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);

    return reply.send(
      await updateQuestion(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentWriteRepository: app.repositories.assessmentWriteRepository,
        },
        { id: params.id, ...body },
      ),
    );
  });

  app.delete('/questions/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const query = z.object({ assessmentVersionId: z.string().uuid() }).parse(request.query);

    await removeQuestion(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { id: params.id, assessmentVersionId: query.assessmentVersionId },
    );

    return reply.code(204).send();
  });

  app.post('/questions/:id/options', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const body = z
      .object({
        assessmentVersionId: z.string().uuid(),
        code: z.string().min(1),
        label: z.string().min(1),
        order: z.number().int().nonnegative(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);

    const created = await addQuestionOption(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { questionId: params.id, ...body },
    );

    return reply.code(201).send(created);
  });

  app.patch('/options/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const body = z
      .object({
        assessmentVersionId: z.string().uuid(),
        label: z.string().optional(),
        order: z.number().int().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(request.body);

    return reply.send(
      await updateQuestionOption(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentWriteRepository: app.repositories.assessmentWriteRepository,
        },
        { id: params.id, ...body },
      ),
    );
  });

  app.delete('/options/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const query = z.object({ assessmentVersionId: z.string().uuid() }).parse(request.query);

    await removeQuestionOption(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { id: params.id, assessmentVersionId: query.assessmentVersionId },
    );

    return reply.code(204).send();
  });

  app.post('/versions/:id/scoring-rules', async (request, reply) => {
    const params = versionParams.parse(request.params);
    const body = z
      .object({
        questionId: z.string().uuid(),
        optionId: z.string().uuid(),
        impacts: z.array(z.object({ dimensionKey: z.string().min(1), weight: z.number() })).min(1),
      })
      .parse(request.body);

    const created = await addScoringRule(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { assessmentVersionId: params.id, ...body },
    );

    return reply.code(201).send(created);
  });

  app.patch('/scoring-rules/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const body = z
      .object({
        assessmentVersionId: z.string().uuid(),
        questionId: z.string().uuid().optional(),
        optionId: z.string().uuid().optional(),
        impacts: z.array(z.object({ dimensionKey: z.string().min(1), weight: z.number() })).optional(),
      })
      .parse(request.body);

    return reply.send(
      await updateScoringRule(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          assessmentWriteRepository: app.repositories.assessmentWriteRepository,
        },
        { id: params.id, ...body },
      ),
    );
  });

  app.delete('/scoring-rules/:id', async (request, reply) => {
    const params = entityParams.parse(request.params);
    const query = z.object({ assessmentVersionId: z.string().uuid() }).parse(request.query);

    await removeScoringRule(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      { id: params.id, assessmentVersionId: query.assessmentVersionId },
    );

    return reply.code(204).send();
  });
};
