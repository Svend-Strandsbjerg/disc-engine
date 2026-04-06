import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  cloneAssessmentVersion,
  createAssessmentDefinition,
  createAssessmentVersion,
  getActiveAssessmentVersion,
  getAssessmentVersionById,
  publishAssessmentVersion,
  validateAssessmentVersion,
} from '@disc-engine/application';

const createAssessmentSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

const createVersionSchema = z.object({
  scoringVersion: z.string().min(1),
});

const cloneVersionSchema = z.object({
  scoringVersion: z.string().min(1),
});

export const registerManagementRoutes = (app: FastifyInstance) => {
  app.post('/assessments', async (request, reply) => {
    const body = createAssessmentSchema.parse(request.body);
    const created = await createAssessmentDefinition(
      { assessmentWriteRepository: app.repositories.assessmentWriteRepository },
      body,
    );

    return reply.code(201).send(created);
  });

  app.post('/assessments/:id/versions', async (request, reply) => {
    const body = createVersionSchema.parse(request.body);
    const params = request.params as { id: string };

    const created = await createAssessmentVersion(
      { assessmentWriteRepository: app.repositories.assessmentWriteRepository },
      { assessmentDefinitionId: params.id, scoringVersion: body.scoringVersion },
    );

    return reply.code(201).send(created);
  });

  app.post('/versions/:id/clone', async (request, reply) => {
    const body = cloneVersionSchema.parse(request.body);
    const params = request.params as { id: string };

    const cloned = await cloneAssessmentVersion(
      { assessmentWriteRepository: app.repositories.assessmentWriteRepository },
      { sourceVersionId: params.id, scoringVersion: body.scoringVersion },
    );

    return reply.code(201).send(cloned);
  });

  app.get('/versions/:id/validation', async (request, reply) => {
    const params = request.params as { id: string };
    const validation = await validateAssessmentVersion(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
      },
      params.id,
    );

    return reply.send(validation);
  });

  app.post('/versions/:id/publish', async (request, reply) => {
    const params = request.params as { id: string };

    const result = await publishAssessmentVersion(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
        assessmentWriteRepository: app.repositories.assessmentWriteRepository,
      },
      params.id,
    );

    if (!result.published) {
      return reply.code(400).send({
        message: 'Assessment version is not publishable',
        validation: result.validation,
      });
    }

    return reply.send({
      assessmentVersion: result.assessmentVersion,
      validation: result.validation,
      warnings: result.validation.warnings,
    });
  });

  app.get('/versions/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const version = await getAssessmentVersionById(
      { assessmentReadRepository: app.repositories.assessmentReadRepository },
      params.id,
    );

    if (!version) {
      return reply.code(404).send({ message: 'Version not found' });
    }

    return reply.send(version);
  });

  app.get('/assessments/:id/active-version', async (request, reply) => {
    const params = request.params as { id: string };

    const version = await getActiveAssessmentVersion(
      { assessmentReadRepository: app.repositories.assessmentReadRepository },
      params.id,
    );

    if (!version) {
      return reply.code(404).send({ message: 'No published version found' });
    }

    return reply.send(version);
  });
};
