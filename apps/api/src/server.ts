import Fastify from 'fastify';
import {
  ApiKeyService,
  PrismaAssessmentRepository,
  PrismaAssessmentSessionRepository,
  PrismaGeneratedReportRepository,
  PrismaReportTemplateRepository,
  PrismaResponseRepository,
  PrismaResultQueryRepository,
  PrismaResultRepository,
  setAccessContext,
} from '@disc-foundation/infrastructure';
import { registerApiKeyRoutes } from './routes/api-keys.js';
import { registerAssessmentRoutes } from './routes/assessments.js';
import { registerManagementRoutes } from './routes/management.js';
import { registerReadRoutes } from './routes/read-models.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerReportTemplateRoutes } from './routes/report-templates.js';
import { registerResponseRoutes } from './routes/responses.js';
import { registerResultRoutes } from './routes/results.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerVersionEditingRoutes } from './routes/version-editing.js';

const app = Fastify({ logger: true });

const assessmentRepository = new PrismaAssessmentRepository();
const reportTemplateRepository = new PrismaReportTemplateRepository();

const repositories = {
  assessmentReadRepository: assessmentRepository,
  assessmentWriteRepository: assessmentRepository,
  assessmentSessionRepository: new PrismaAssessmentSessionRepository(),
  responseRepository: new PrismaResponseRepository(),
  resultRepository: new PrismaResultRepository(),
  resultQueryRepository: new PrismaResultQueryRepository(),
  reportTemplateReadRepository: reportTemplateRepository,
  reportTemplateWriteRepository: reportTemplateRepository,
  generatedReportRepository: new PrismaGeneratedReportRepository(),
};

const services = {
  apiKeyService: new ApiKeyService(),
};

const rateWindowMs = 60_000;
const rateLimit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      tenantId: string;
      apiKeyId: string;
    };
  }

  interface FastifyInstance {
    repositories: typeof repositories;
    services: typeof services;
  }
}

app.decorate('repositories', repositories);
app.decorate('services', services);

app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health') {
    return;
  }

  const rawApiKey = request.headers['x-api-key'];
  if (!rawApiKey || Array.isArray(rawApiKey)) {
    return reply.code(401).send({ message: 'Missing API key' });
  }

  const validated = await services.apiKeyService.validateApiKey(rawApiKey);
  if (!validated) {
    return reply.code(401).send({ message: 'Invalid or inactive API key' });
  }

  const now = Date.now();
  const bucket = rateBuckets.get(validated.apiKeyId);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(validated.apiKeyId, { count: 1, resetAt: now + rateWindowMs });
  } else {
    bucket.count += 1;
    if (bucket.count > rateLimit) {
      return reply.code(429).send({ message: 'Rate limit exceeded' });
    }
  }

  request.auth = {
    tenantId: validated.tenantId,
    apiKeyId: validated.apiKeyId,
  };

  setAccessContext(request.auth);
});

app.get('/health', async () => ({ status: 'ok' }));

registerApiKeyRoutes(app);
registerManagementRoutes(app);
registerVersionEditingRoutes(app);
registerSessionRoutes(app);
registerAssessmentRoutes(app);
registerResponseRoutes(app);
registerResultRoutes(app);
registerReportRoutes(app);
registerReportTemplateRoutes(app);
registerReadRoutes(app);

const start = async () => {
  try {
    const port = Number(process.env.PORT ?? 3000);
    await app.listen({ port, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
