import { z } from 'zod';

const createApiKeySchema = z.object({
  name: z.string().min(2),
});

export const createApiKey = async (
  deps: { apiKeyService: { createApiKey(input: { tenantId: string; name: string }): Promise<{ id: string; rawKey: string }> } },
  input: { tenantId: string; name: string },
) => {
  const parsed = createApiKeySchema.parse({ name: input.name });
  return deps.apiKeyService.createApiKey({ tenantId: input.tenantId, name: parsed.name });
};

export const listApiKeys = async (
  deps: { apiKeyService: { listApiKeys(tenantId: string): Promise<Array<{ id: string; name: string; isActive: boolean; createdAt: Date; lastUsedAt: Date | null }>> } },
  tenantId: string,
) => {
  return deps.apiKeyService.listApiKeys(tenantId);
};
