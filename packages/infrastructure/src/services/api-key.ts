import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from './prisma.js';

const hashKey = (value: string): string => createHash('sha256').update(value).digest('hex');

const generateRawApiKey = (): { keyPrefix: string; rawKey: string; hashed: string } => {
  const prefix = randomBytes(8).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const rawKey = `disc_${prefix}_${secret}`;

  return {
    keyPrefix: prefix,
    rawKey,
    hashed: hashKey(rawKey),
  };
};

export class ApiKeyService {
  async createApiKey(input: { tenantId: string; name: string }): Promise<{ id: string; rawKey: string }> {
    const generated = generateRawApiKey();

    const created = await prisma.apiKey.create({
      data: {
        key: generated.hashed,
        keyPrefix: generated.keyPrefix,
        tenantId: input.tenantId,
        name: input.name,
        isActive: true,
      },
    });

    return { id: created.id, rawKey: generated.rawKey };
  }

  async listApiKeys(tenantId: string) {
    return prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  async validateApiKey(rawKey: string): Promise<{ apiKeyId: string; tenantId: string } | null> {
    const parts = rawKey.split('_');
    const keyPrefix = parts[1];
    if (!keyPrefix) {
      return null;
    }

    const candidate = await prisma.apiKey.findUnique({
      where: { keyPrefix },
      select: { id: true, key: true, tenantId: true, isActive: true },
    });

    if (!candidate || !candidate.isActive) {
      return null;
    }

    const incoming = Buffer.from(hashKey(rawKey), 'hex');
    const stored = Buffer.from(candidate.key, 'hex');
    if (incoming.length !== stored.length || !timingSafeEqual(incoming, stored)) {
      return null;
    }

    await prisma.apiKey.update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } });

    return { apiKeyId: candidate.id, tenantId: candidate.tenantId };
  }
}
