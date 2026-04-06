import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createApiKey, listApiKeys } from '@disc-engine/application';

const createApiKeySchema = z.object({
  name: z.string().min(2),
});

export const registerApiKeyRoutes = (app: FastifyInstance) => {
  app.post('/api-keys', async (request, reply) => {
    const body = createApiKeySchema.parse(request.body);

    const created = await createApiKey(
      { apiKeyService: app.services.apiKeyService },
      { tenantId: request.auth.tenantId, name: body.name },
    );

    return reply.code(201).send(created);
  });

  app.get('/api-keys', async (request, reply) => {
    const keys = await listApiKeys({ apiKeyService: app.services.apiKeyService }, request.auth.tenantId);
    return reply.send(keys);
  });
};
