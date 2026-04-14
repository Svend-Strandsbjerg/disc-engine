import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  cloneAssessmentVersion,
  createAssessmentDefinition,
  createAssessmentVersion,
  getActiveAssessmentVersion,
  getAssessmentVersionById,
  getPilotItemBankAnalysis,
  publishAssessmentVersion,
  validateAssessmentVersion,
} from '@disc-foundation/application';

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
const idParamsSchema = z.object({ id: z.string().uuid() });

const pilotAnalysisQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minSampleSize: z.coerce.number().int().positive().optional(),
  concentrationThreshold: z.coerce.number().min(0).max(1).optional(),
  separationThreshold: z.coerce.number().min(0).max(1).optional(),
  mirrorContradictionThreshold: z.coerce.number().min(0).max(1).optional(),
});

export const registerManagementRoutes = (app: FastifyInstance) => {
  app.post('/assessments', async (request, reply) => {
    const body = createAssessmentSchema.parse(request.body);
    const created = await createAssessmentDefinition(
      { assessmentWriteRepository: app.repositories.assessmentWriteRepository },
      {
        key: body.key,
        name: body.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    );

    return reply.code(201).send(created);
  });

  app.post('/assessments/:id/versions', async (request, reply) => {
    const body = createVersionSchema.parse(request.body);
    const params = idParamsSchema.parse(request.params);

    const created = await createAssessmentVersion(
      { assessmentWriteRepository: app.repositories.assessmentWriteRepository },
      { assessmentDefinitionId: params.id, scoringVersion: body.scoringVersion },
    );

    return reply.code(201).send(created);
  });

  app.post('/versions/:id/clone', async (request, reply) => {
    const body = cloneVersionSchema.parse(request.body);
    const params = idParamsSchema.parse(request.params);

    const cloned = await cloneAssessmentVersion(
      { assessmentWriteRepository: app.repositories.assessmentWriteRepository },
      { sourceVersionId: params.id, scoringVersion: body.scoringVersion },
    );

    return reply.code(201).send(cloned);
  });

  app.get('/versions/:id/validation', async (request, reply) => {
    const params = idParamsSchema.parse(request.params);
    const validation = await validateAssessmentVersion(
      {
        assessmentReadRepository: app.repositories.assessmentReadRepository,
      },
      params.id,
    );

    return reply.send(validation);
  });

  app.get('/internal/versions/:id/pilot-analysis', async (request, reply) => {
    const params = idParamsSchema.parse(request.params);
    const query = pilotAnalysisQuerySchema.parse(request.query);

    try {
      const analysis = await getPilotItemBankAnalysis(
        {
          assessmentReadRepository: app.repositories.assessmentReadRepository,
          resultQueryRepository: app.repositories.resultQueryRepository,
        },
        {
          assessmentVersionId: params.id,
          ...(query.from ? { from: new Date(query.from) } : {}),
          ...(query.to ? { to: new Date(query.to) } : {}),
          ...(query.minSampleSize !== undefined ? { minSampleSize: query.minSampleSize } : {}),
          ...(query.concentrationThreshold !== undefined
            ? { concentrationThreshold: query.concentrationThreshold }
            : {}),
          ...(query.separationThreshold !== undefined
            ? { separationThreshold: query.separationThreshold }
            : {}),
          ...(query.mirrorContradictionThreshold !== undefined
            ? { mirrorContradictionThreshold: query.mirrorContradictionThreshold }
            : {}),
        },
      );

      return reply.send(analysis);
    } catch (error) {
      if (error instanceof Error && error.message === 'Assessment version not found') {
        return reply.code(404).send({ message: error.message });
      }
      if (
        error instanceof Error &&
        error.message === 'Pilot analysis is only available for disc-v3-item-bank'
      ) {
        return reply.code(400).send({ message: error.message });
      }

      throw error;
    }
  });

  app.post('/versions/:id/publish', async (request, reply) => {
    const params = idParamsSchema.parse(request.params);

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
    const params = idParamsSchema.parse(request.params);
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
    const params = idParamsSchema.parse(request.params);

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
