import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateReportForSession, getGeneratedReportById } from '@disc-engine/application';

const generateReportSchema = z.object({
  templateId: z.string().uuid(),
});

export const registerReportRoutes = (app: FastifyInstance) => {
  app.post('/sessions/:id/generate-report', async (request, reply) => {
    const params = request.params as { id: string };
    const body = generateReportSchema.parse(request.body);

    const report = await generateReportForSession(
      {
        assessmentSessionRepository: app.repositories.assessmentSessionRepository,
        resultRepository: app.repositories.resultRepository,
        reportTemplateReadRepository: app.repositories.reportTemplateReadRepository,
        generatedReportRepository: app.repositories.generatedReportRepository,
      },
      { sessionId: params.id, templateId: body.templateId },
    );

    return reply.code(201).send(report);
  });

  app.get('/reports/:id', async (request, reply) => {
    const params = request.params as { id: string };

    const report = await getGeneratedReportById(
      { generatedReportRepository: app.repositories.generatedReportRepository },
      params.id,
    );

    if (!report) {
      return reply.code(404).send({ message: 'Report not found' });
    }

    return reply.send(report);
  });
};
