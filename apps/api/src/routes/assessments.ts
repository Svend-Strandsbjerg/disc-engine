import type { FastifyInstance } from 'fastify';
import { getAssessmentVersionMetadata } from '@disc-engine/application';

export const registerAssessmentRoutes = (app: FastifyInstance) => {
  app.get('/assessment-versions/:versionId', async (request, reply) => {
    const params = request.params as { versionId: string };

    const metadata = await getAssessmentVersionMetadata(
      { assessmentReadRepository: app.repositories.assessmentReadRepository },
      params.versionId,
    );

    if (!metadata) {
      return reply.code(404).send({ message: 'Assessment version not found' });
    }

    return reply.send(metadata);
  });
};
