import type { FastifyInstance } from 'fastify';
import {
  getAssessmentVersionMetadata,
  listDiscProductVersions,
} from '@disc-foundation/application';

export const registerAssessmentRoutes = (app: FastifyInstance) => {
  app.get('/products/disc/versions', async (_request, reply) => {
    const versions = await listDiscProductVersions({
      assessmentReadRepository: app.repositories.assessmentReadRepository,
    });

    return reply.send(versions);
  });

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
