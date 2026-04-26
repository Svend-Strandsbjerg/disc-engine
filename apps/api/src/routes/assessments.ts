import type { FastifyInstance } from 'fastify';
import {
  DiscVersionDiscoverySetupError,
  getAssessmentVersionMetadata,
  listDiscProductVersions,
} from '@disc-foundation/application';
import { Prisma } from '@prisma/client';

export const registerAssessmentRoutes = (app: FastifyInstance) => {
  app.get('/products/disc/versions', async (request, reply) => {
    app.log.info(
      {
        route: request.routeOptions.url,
        tenantId: request.auth.tenantId,
        apiKeyId: request.auth.apiKeyId,
      },
      'DISC product version discovery requested',
    );

    try {
      const versions = await listDiscProductVersions({
        assessmentReadRepository: app.repositories.assessmentReadRepository,
      });

      app.log.info(
        {
          route: request.routeOptions.url,
          tenantId: request.auth.tenantId,
          apiKeyId: request.auth.apiKeyId,
          discoveredVersionKeys: versions.versions.map((version) => version.key),
        },
        'DISC product version discovery completed',
      );

      return reply.send(versions);
    } catch (error) {
      app.log.error(
        {
          err: error,
          route: request.routeOptions.url,
          tenantId: request.auth.tenantId,
          apiKeyId: request.auth.apiKeyId,
        },
        'DISC product version discovery failed',
      );

      if (error instanceof DiscVersionDiscoverySetupError) {
        return reply.code(503).send({
          message: error.message,
          code: error.code,
        });
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        return reply.code(503).send({
          message:
            'DISC version discovery is unavailable because required database schema objects are missing. Run pending Prisma migrations and seed data.',
          code: error.code,
        });
      }

      throw error;
    }
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
