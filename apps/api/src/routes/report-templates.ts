import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addInterpretationRule,
  addReportSection,
  cloneReportTemplateVersion,
  createReportTemplate,
  createReportTemplateVersion,
  getActiveReportTemplateVersion,
  getReportTemplateVersionById,
  publishReportTemplateVersion,
  removeInterpretationRule,
  removeReportSection,
  updateInterpretationRule,
  updateReportSection,
  validateReportTemplateVersion,
} from '@disc-foundation/application';

const createTemplateSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

const createTemplateVersionSchema = z.object({
  templateVersion: z.string().min(1),
  linkedAssessmentVersionId: z.string().uuid().optional(),
});

const cloneTemplateVersionSchema = z.object({
  templateVersion: z.string().min(1),
});

const addSectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
});

const updateSectionSchema = z.object({
  templateId: z.string().uuid(),
  title: z.string().min(1).optional(),
  order: z.number().int().nonnegative().optional(),
});

const addRuleSchema = z.object({
  sectionKey: z.string().min(1),
  target: z.object({
    type: z.enum(['dimension', 'combination']),
    dimensionKeys: z.array(z.string().min(1)).min(1),
  }),
  condition: z.object({
    type: z.enum(['high', 'medium', 'low', 'top_dimension', 'lowest_dimension']),
    minScore: z.number().optional(),
    maxScore: z.number().optional(),
  }),
  output: z.string().min(1),
  priority: z.number().int(),
});

const updateRuleSchema = z.object({
  templateId: z.string().uuid(),
  sectionKey: z.string().min(1).optional(),
  target: z
    .object({
      type: z.enum(['dimension', 'combination']),
      dimensionKeys: z.array(z.string().min(1)).min(1),
    })
    .optional(),
  condition: z
    .object({
      type: z.enum(['high', 'medium', 'low', 'top_dimension', 'lowest_dimension']),
      minScore: z.number().optional(),
      maxScore: z.number().optional(),
    })
    .optional(),
  output: z.string().min(1).optional(),
  priority: z.number().int().optional(),
});

const deleteWithTemplateSchema = z.object({
  templateId: z.string().uuid(),
});

export const registerReportTemplateRoutes = (app: FastifyInstance) => {
  app.post('/report-templates', async (request, reply) => {
    const body = createTemplateSchema.parse(request.body);
    const created = await createReportTemplate(
      { reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository },
      body,
    );

    return reply.code(201).send(created);
  });

  app.post('/report-templates/:id/versions', async (request, reply) => {
    const params = request.params as { id: string };
    const body = createTemplateVersionSchema.parse(request.body);

    const created = await createReportTemplateVersion(
      { reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository },
      {
        reportTemplateDefinitionId: params.id,
        templateVersion: body.templateVersion,
        linkedAssessmentVersionId: body.linkedAssessmentVersionId,
      },
    );

    return reply.code(201).send(created);
  });

  app.post('/report-templates/versions/:id/clone', async (request, reply) => {
    const params = request.params as { id: string };
    const body = cloneTemplateVersionSchema.parse(request.body);

    const cloned = await cloneReportTemplateVersion(
      { reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository },
      { sourceTemplateVersionId: params.id, templateVersion: body.templateVersion },
    );

    return reply.code(201).send(cloned);
  });

  app.get('/report-templates/versions/:id/validation', async (request, reply) => {
    const params = request.params as { id: string };
    const validation = await validateReportTemplateVersion(
      { reportTemplateReadRepository: app.repositories.reportTemplateReadRepository },
      params.id,
    );

    return reply.send(validation);
  });

  app.post('/report-templates/versions/:id/publish', async (request, reply) => {
    const params = request.params as { id: string };

    const published = await publishReportTemplateVersion(
      {
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository,
      },
      params.id,
    );

    if (!published.published) {
      return reply.code(400).send({
        message: 'Report template version is not publishable',
        validation: published.validation,
      });
    }

    return reply.send(published);
  });

  app.get('/report-templates/versions/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const version = await getReportTemplateVersionById(
      { reportTemplateReadRepository: app.repositories.reportTemplateReadRepository },
      params.id,
    );

    if (!version) {
      return reply.code(404).send({ message: 'Report template version not found' });
    }

    return reply.send(version);
  });

  app.get('/report-templates/:id/active-version', async (request, reply) => {
    const params = request.params as { id: string };
    const version = await getActiveReportTemplateVersion(
      { reportTemplateReadRepository: app.repositories.reportTemplateReadRepository },
      params.id,
    );

    if (!version) {
      return reply.code(404).send({ message: 'No published report template version found' });
    }

    return reply.send(version);
  });

  app.post('/report-templates/versions/:id/sections', async (request, reply) => {
    const params = request.params as { id: string };
    const body = addSectionSchema.parse(request.body);

    const created = await addReportSection(
      {
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository,
      },
      { templateId: params.id, ...body },
    );

    return reply.code(201).send(created);
  });

  app.patch('/report-sections/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = updateSectionSchema.parse(request.body);

    const updated = await updateReportSection(
      {
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository,
      },
      { id: params.id, ...body },
    );

    return reply.send(updated);
  });

  app.delete('/report-sections/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = deleteWithTemplateSchema.parse(request.body ?? {});

    await removeReportSection(
      {
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository,
      },
      { id: params.id, templateId: body.templateId },
    );

    return reply.code(204).send();
  });

  app.post('/report-templates/versions/:id/rules', async (request, reply) => {
    const params = request.params as { id: string };
    const body = addRuleSchema.parse(request.body);

    const created = await addInterpretationRule(
      {
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository,
      },
      { templateId: params.id, ...body },
    );

    return reply.code(201).send(created);
  });

  app.patch('/interpretation-rules/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = updateRuleSchema.parse(request.body);

    const updated = await updateInterpretationRule(
      {
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository,
      },
      { id: params.id, ...body },
    );

    return reply.send(updated);
  });

  app.delete('/interpretation-rules/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = deleteWithTemplateSchema.parse(request.body ?? {});

    await removeInterpretationRule(
      {
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        reportTemplateWriteRepository: app.repositories.reportTemplateWriteRepository,
      },
      { id: params.id, templateId: body.templateId },
    );

    return reply.code(204).send();
  });
};
