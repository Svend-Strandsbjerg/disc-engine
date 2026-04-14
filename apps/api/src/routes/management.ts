import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  compareCandidateItemSimilarity,
  cloneAssessmentVersion,
  createCandidateItem,
  createAssessmentDefinition,
  createAssessmentVersion,
  getActiveAssessmentVersion,
  getAssessmentVersionById,
  getPilotItemBankAnalysis,
  importCandidateItemGenerationBatch,
  publishAssessmentVersion,
  promoteCandidateItemsToDraftVersion,
  reviewCandidateItem,
  listCandidateItems,
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

const createCandidateItemSchema = z.object({
  assessmentDefinitionId: z.string().uuid(),
  prompt: z.string().min(5),
  axis: z.enum(['tempo', 'focus']),
  axisDirection: z.enum(['highTempo', 'lowTempo', 'taskFocus', 'peopleFocus']),
  weight: z.number().positive(),
  reverseKeyed: z.boolean(),
  role: z.enum(['core', 'mirror', 'tiebreaker']),
  mirrorCandidateItemId: z.string().uuid().optional(),
  contextApplicability: z.array(z.enum(['work', 'private', 'generic'])).min(1),
  disambiguationTags: z.array(z.string().min(1)).optional(),
  uncertaintyProfile: z.string().optional(),
  aiGenerated: z.boolean().default(false),
  aiModel: z.string().optional(),
  aiPromptVersion: z.string().optional(),
  aiRationale: z.string().optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  aiSuggestedAlternatives: z.array(z.string()).optional(),
});

const candidateItemReviewSchema = z.object({
  clarityScore: z.number().min(0).max(1),
  ambiguityRisk: z.number().min(0).max(1),
  doubleBarreledRisk: z.number().min(0).max(1),
  socialDesirabilityRisk: z.number().min(0).max(1),
  discriminationPotential: z.number().min(0).max(1),
  mirrorUsefulness: z.number().min(0).max(1),
  overlapRisk: z.number().min(0).max(1),
  reviewerNotes: z.string().optional(),
  status: z.enum(['candidate', 'needs_revision', 'approved', 'rejected']),
  nearDuplicateQuestionIds: z.array(z.string().uuid()).optional(),
});

const candidateItemListQuerySchema = z.object({
  status: z.enum(['candidate', 'needs_revision', 'approved', 'rejected']).optional(),
  includePromoted: z.coerce.boolean().optional(),
});

const candidateSimilarityBodySchema = z.object({
  assessmentDefinitionId: z.string().uuid(),
  prompt: z.string().min(5),
  threshold: z.number().min(0).max(1).optional(),
  limit: z.number().int().positive().max(50).optional(),
});

const promoteCandidatesBodySchema = z.object({
  candidateItemIds: z.array(z.string().uuid()).min(1),
});

const importGenerationBatchSchema = z.object({
  generationId: z.string().min(1),
  sourceType: z.enum(['ai_assistant', 'human_seeded', 'bulk_import', 'other']),
  modelName: z.string().min(1),
  promptVersion: z.string().min(1),
  targetAssessmentDefinitionId: z.string().uuid(),
  context: z.enum(['work', 'private', 'generic']).optional(),
  rationaleNotes: z.string().optional(),
  items: z
    .array(
      z.object({
        prompt: z.string().min(5),
        axis: z.enum(['tempo', 'focus']),
        axisDirection: z.enum(['highTempo', 'lowTempo', 'taskFocus', 'peopleFocus']),
        weight: z.number().positive().max(5),
        reverseKeyed: z.boolean().default(false),
        role: z.enum(['core', 'mirror', 'tiebreaker']),
        mirrorReferenceKey: z.string().optional(),
        contextApplicability: z.array(z.enum(['work', 'private', 'generic'])).min(1),
        disambiguationTags: z.array(z.string()).optional(),
        uncertaintyProfile: z.string().optional(),
        aiGenerated: z.boolean().default(true),
        aiModel: z.string().min(1),
        aiPromptVersion: z.string().min(1),
        aiRationale: z.string().optional(),
        aiConfidence: z.number().min(0).max(1).optional(),
        aiSuggestedAlternatives: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(200),
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

  app.post('/internal/candidate-items', async (request, reply) => {
    const body = createCandidateItemSchema.parse(request.body);
    const created = await createCandidateItem(
      { candidateItemRepository: app.repositories.candidateItemRepository },
      body,
    );
    return reply.code(201).send(created);
  });

  app.get('/internal/assessments/:id/candidate-items', async (request, reply) => {
    const params = idParamsSchema.parse(request.params);
    const query = candidateItemListQuerySchema.parse(request.query);
    const items = await listCandidateItems(
      { candidateItemRepository: app.repositories.candidateItemRepository },
      {
        assessmentDefinitionId: params.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.includePromoted !== undefined ? { includePromoted: query.includePromoted } : {}),
      },
    );
    return reply.send(items);
  });

  app.post('/internal/candidate-items/:id/reviews', async (request, reply) => {
    const params = idParamsSchema.parse(request.params);
    const body = candidateItemReviewSchema.parse(request.body);
    const created = await reviewCandidateItem(
      { candidateItemRepository: app.repositories.candidateItemRepository },
      { ...body, candidateItemId: params.id },
    );
    return reply.code(201).send(created);
  });

  app.post('/internal/candidate-items/similarity', async (request, reply) => {
    const body = candidateSimilarityBodySchema.parse(request.body);
    const matches = await compareCandidateItemSimilarity(
      { candidateItemRepository: app.repositories.candidateItemRepository },
      body,
    );
    return reply.send(matches);
  });

  app.post('/internal/versions/:id/promote-candidates', async (request, reply) => {
    const params = idParamsSchema.parse(request.params);
    const body = promoteCandidatesBodySchema.parse(request.body);
    const promoted = await promoteCandidateItemsToDraftVersion(
      {
        candidateItemRepository: app.repositories.candidateItemRepository,
        assessmentReadRepository: app.repositories.assessmentReadRepository,
      },
      { assessmentVersionId: params.id, candidateItemIds: body.candidateItemIds },
    );
    return reply.send({ promoted });
  });

  app.post('/internal/candidate-item-generation-batches/import', async (request, reply) => {
    const body = importGenerationBatchSchema.parse(request.body);
    const result = await importCandidateItemGenerationBatch(
      { candidateItemRepository: app.repositories.candidateItemRepository },
      {
        ...body,
        items: body.items.map((item) => ({
          ...item,
          disambiguationTags: item.disambiguationTags ?? [],
          aiSuggestedAlternatives: item.aiSuggestedAlternatives ?? [],
        })),
      },
    );

    return reply.code(201).send(result);
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
