import { Prisma } from '@prisma/client';
import type {
  AssessmentReadRepository,
  AssessmentWriteRepository,
} from '@disc-foundation/application';
import type {
  AssessmentDefinition,
  AssessmentVersion,
  DimensionImpact,
  Question,
  QuestionOption,
  ScoreDimension,
  ScoringRule,
} from '@disc-foundation/domain';
import type { UUID } from '@disc-foundation/shared';
import { prisma } from '../services/prisma.js';
import { getAccessContext } from '../services/access-context.js';

const versionInclude = {
  scoreDimensions: { orderBy: { order: 'asc' } },
  questions: {
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } }, scoringRules: true },
  },
  scoringRules: true,
} satisfies Prisma.AssessmentVersionInclude;

type VersionRecord = Prisma.AssessmentVersionGetPayload<{ include: typeof versionInclude }>;

const getTenantId = (): string => getAccessContext().tenantId;

const parseImpacts = (value: Prisma.JsonValue): DimensionImpact[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { dimensionKey: string; weight: number } => {
      return (
        typeof item === 'object' &&
        item !== null &&
        'dimensionKey' in item &&
        typeof (item as { dimensionKey?: unknown }).dimensionKey === 'string' &&
        'weight' in item &&
        typeof (item as { weight?: unknown }).weight === 'number'
      );
    })
    .map((item) => ({ dimensionKey: item.dimensionKey, weight: item.weight }));
};

const mapVersion = (record: VersionRecord): AssessmentVersion => {
  const dimensions: ScoreDimension[] = record.scoreDimensions.map((dimension) => ({
    id: dimension.id,
    key: dimension.key,
    label: dimension.label,
    order: dimension.order,
  }));

  const questions: Question[] = record.questions.map((question) => ({
    id: question.id,
    assessmentVersionId: question.assessmentVersionId,
    code: question.code,
    prompt: question.prompt,
    type: question.type,
    order: question.order,
    required: question.required,
    options: question.options.map(
      (option): QuestionOption => ({
        id: option.id,
        questionId: option.questionId,
        code: option.code,
        label: option.label,
        order: option.order,
        ...(option.metadata ? { metadata: option.metadata as Record<string, unknown> } : {}),
      }),
    ),
    ...(question.metadata ? { metadata: question.metadata as Record<string, unknown> } : {}),
  }));

  const scoringRules: ScoringRule[] = record.scoringRules.map((rule) => ({
    id: rule.id,
    assessmentVersionId: rule.assessmentVersionId,
    questionId: rule.questionId,
    optionId: rule.optionId,
    impacts: parseImpacts(rule.impacts),
  }));

  return {
    id: record.id,
    assessmentDefinitionId: record.assessmentDefinitionId,
    versionNumber: record.versionNumber,
    scoringVersion: record.scoringVersion,
    status: record.status,
    questionCount: record.questionCount,
    createdAt: record.createdAt,
    ...(record.publishedAt ? { publishedAt: record.publishedAt } : {}),
    ...(record.immutableAt ? { immutableAt: record.immutableAt } : {}),
    dimensions,
    questions,
    scoringRules,
  };
};

const assertDraftVersion = async (versionId: UUID): Promise<void> => {
  const tenantId = getTenantId();
  const version = await prisma.assessmentVersion.findFirst({ where: { id: versionId, tenantId } });
  if (!version) throw new Error('Assessment version not found');
  if (version.status !== 'draft' || version.immutableAt) {
    throw new Error('Published immutable versions cannot be edited');
  }
};

const syncQuestionCount = async (tx: Prisma.TransactionClient, assessmentVersionId: UUID): Promise<void> => {
  const questionCount = await tx.question.count({ where: { assessmentVersionId } });
  await tx.assessmentVersion.update({
    where: { id: assessmentVersionId },
    data: { questionCount },
  });
};

export class PrismaAssessmentRepository implements AssessmentReadRepository, AssessmentWriteRepository {
  async createAssessmentDefinition(input: {
    key: string;
    name: string;
    description?: string;
  }): Promise<AssessmentDefinition> {
    const tenantId = getTenantId();
    const created = await prisma.assessmentDefinition.create({ data: { ...input, tenantId } });
    return {
      id: created.id,
      key: created.key,
      name: created.name,
      ...(created.description ? { description: created.description } : {}),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async createAssessmentVersionDraft(input: {
    assessmentDefinitionId: UUID;
    scoringVersion: string;
  }): Promise<AssessmentVersion> {
    const tenantId = getTenantId();
    const latest = await prisma.assessmentVersion.findFirst({
      where: { assessmentDefinitionId: input.assessmentDefinitionId, tenantId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const created = await prisma.assessmentVersion.create({
      data: {
        assessmentDefinitionId: input.assessmentDefinitionId,
        tenantId,
        scoringVersion: input.scoringVersion,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: 'draft',
        questionCount: 0,
      },
      include: versionInclude,
    });

    return mapVersion(created);
  }

  async cloneAssessmentVersion(input: {
    sourceVersionId: UUID;
    scoringVersion: string;
  }): Promise<AssessmentVersion> {
    const tenantId = getTenantId();
    return prisma.$transaction(async (tx) => {
      const source = await tx.assessmentVersion.findFirst({
        where: { id: input.sourceVersionId, tenantId },
        include: versionInclude,
      });
      if (!source) throw new Error('Source version not found');

      const latest = await tx.assessmentVersion.findFirst({
        where: { assessmentDefinitionId: source.assessmentDefinitionId, tenantId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });

      const cloned = await tx.assessmentVersion.create({
        data: {
          assessmentDefinitionId: source.assessmentDefinitionId,
          tenantId,
          scoringVersion: input.scoringVersion,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          status: 'draft',
          questionCount: source.questionCount,
          scoreDimensions: {
            createMany: {
              data: source.scoreDimensions.map((dimension) => ({
                key: dimension.key,
                label: dimension.label,
                order: dimension.order,
              })),
            },
          },
        },
      });

      const questionMap = new Map<string, string>();
      const optionMap = new Map<string, string>();

      for (const question of source.questions) {
        const q = await tx.question.create({
          data: {
            assessmentVersionId: cloned.id,
            code: question.code,
            prompt: question.prompt,
            type: question.type,
            order: question.order,
            required: question.required,
            metadata: question.metadata,
          },
        });
        questionMap.set(question.id, q.id);

        for (const option of question.options) {
          const o = await tx.questionOption.create({
            data: {
              questionId: q.id,
              code: option.code,
              label: option.label,
              order: option.order,
              metadata: option.metadata,
            },
          });
          optionMap.set(option.id, o.id);
        }
      }

      for (const rule of source.scoringRules) {
        const questionId = questionMap.get(rule.questionId);
        const optionId = optionMap.get(rule.optionId);
        if (!questionId || !optionId) throw new Error('Unable to clone scoring rule references');

        await tx.scoringRule.create({
          data: {
            assessmentVersionId: cloned.id,
            questionId,
            optionId,
            impacts: rule.impacts,
          },
        });
      }

      const full = await tx.assessmentVersion.findFirst({ where: { id: cloned.id, tenantId }, include: versionInclude });
      if (!full) throw new Error('Cloned version not found');
      return mapVersion(full);
    });
  }

  async publishAssessmentVersion(versionId: UUID): Promise<AssessmentVersion> {
    const tenantId = getTenantId();
    const current = await prisma.assessmentVersion.findFirst({ where: { id: versionId, tenantId } });
    if (!current) throw new Error('Assessment version not found');
    if (current.status !== 'draft' || current.immutableAt) {
      throw new Error('Only draft mutable versions can be published');
    }

    const published = await prisma.assessmentVersion.update({
      where: { id: versionId },
      data: { status: 'published', publishedAt: new Date(), immutableAt: new Date() },
      include: versionInclude,
    });
    return mapVersion(published);
  }

  async updateDraftVersion(version: AssessmentVersion): Promise<AssessmentVersion> {
    await assertDraftVersion(version.id);
    const updated = await prisma.assessmentVersion.update({
      where: { id: version.id },
      data: { scoringVersion: version.scoringVersion, questionCount: version.questionCount },
      include: versionInclude,
    });
    return mapVersion(updated);
  }

  async getVersion(versionId: UUID): Promise<AssessmentVersion | null> {
    const tenantId = getTenantId();
    const record = await prisma.assessmentVersion.findFirst({ where: { id: versionId, tenantId }, include: versionInclude });
    return record ? mapVersion(record) : null;
  }

  async getActivePublishedVersion(assessmentDefinitionId: UUID): Promise<AssessmentVersion | null> {
    const tenantId = getTenantId();
    const record = await prisma.assessmentVersion.findFirst({
      where: { assessmentDefinitionId, status: 'published', tenantId },
      orderBy: [{ versionNumber: 'desc' }, { publishedAt: 'desc' }],
      include: versionInclude,
    });
    return record ? mapVersion(record) : null;
  }

  async addScoreDimension(input: {
    assessmentVersionId: UUID;
    key: string;
    label: string;
    order: number;
  }): Promise<ScoreDimension> {
    await assertDraftVersion(input.assessmentVersionId);
    const created = await prisma.scoreDimension.create({ data: input });
    return { id: created.id, key: created.key, label: created.label, order: created.order };
  }

  async updateScoreDimension(input: { id: UUID; label?: string; order?: number }): Promise<ScoreDimension> {
    const current = await prisma.scoreDimension.findUnique({
      where: { id: input.id },
      include: { assessmentVersion: true },
    });
    if (!current) throw new Error('Score dimension not found');
    await assertDraftVersion(current.assessmentVersionId);

    const updated = await prisma.scoreDimension.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
      },
    });

    return { id: updated.id, key: updated.key, label: updated.label, order: updated.order };
  }

  async removeScoreDimension(id: UUID): Promise<void> {
    const current = await prisma.scoreDimension.findFirst({ where: { id, assessmentVersion: { tenantId: getTenantId() } } });
    if (!current) throw new Error('Score dimension not found');
    await assertDraftVersion(current.assessmentVersionId);
    await prisma.scoreDimension.delete({ where: { id } });
  }

  async addQuestion(input: {
    assessmentVersionId: UUID;
    code: string;
    prompt: string;
    type: Question['type'];
    order: number;
    required: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<Question> {
    await assertDraftVersion(input.assessmentVersionId);

    return prisma.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          assessmentVersionId: input.assessmentVersionId,
          code: input.code,
          prompt: input.prompt,
          type: input.type,
          order: input.order,
          required: input.required,
          metadata: input.metadata,
        },
      });
      await syncQuestionCount(tx, input.assessmentVersionId);
      return {
        id: created.id,
        assessmentVersionId: created.assessmentVersionId,
        code: created.code,
        prompt: created.prompt,
        type: created.type,
        order: created.order,
        required: created.required,
        options: [],
        ...(created.metadata ? { metadata: created.metadata as Record<string, unknown> } : {}),
      };
    });
  }

  async updateQuestion(input: {
    id: UUID;
    prompt?: string;
    type?: Question['type'];
    order?: number;
    required?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<Question> {
    const current = await prisma.question.findUnique({
      where: { id: input.id },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    if (!current) throw new Error('Question not found');
    await assertDraftVersion(current.assessmentVersionId);

    const updated = await prisma.question.update({
      where: { id: input.id },
      data: {
        ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    return {
      id: updated.id,
      assessmentVersionId: updated.assessmentVersionId,
      code: updated.code,
      prompt: updated.prompt,
      type: updated.type,
      order: updated.order,
      required: updated.required,
      options: updated.options.map((option) => ({
        id: option.id,
        questionId: option.questionId,
        code: option.code,
        label: option.label,
        order: option.order,
        ...(option.metadata ? { metadata: option.metadata as Record<string, unknown> } : {}),
      })),
      ...(updated.metadata ? { metadata: updated.metadata as Record<string, unknown> } : {}),
    };
  }

  async removeQuestion(id: UUID): Promise<void> {
    const current = await prisma.question.findFirst({ where: { id, assessmentVersion: { tenantId: getTenantId() } } });
    if (!current) throw new Error('Question not found');
    await assertDraftVersion(current.assessmentVersionId);

    await prisma.$transaction(async (tx) => {
      await tx.scoringRule.deleteMany({ where: { questionId: id } });
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.question.delete({ where: { id } });
      await syncQuestionCount(tx, current.assessmentVersionId);
    });
  }

  async questionHasResponses(questionId: UUID): Promise<boolean> {
    const tenantId = getTenantId();
    const count = await prisma.response.count({ where: { questionId, session: { tenantId } } });
    return count > 0;
  }

  async addQuestionOption(input: {
    questionId: UUID;
    code: string;
    label: string;
    order: number;
    metadata?: Record<string, unknown>;
  }): Promise<QuestionOption> {
    const question = await prisma.question.findFirst({ where: { id: input.questionId, assessmentVersion: { tenantId: getTenantId() } } });
    if (!question) throw new Error('Question not found');
    await assertDraftVersion(question.assessmentVersionId);

    const created = await prisma.questionOption.create({ data: input });
    return {
      id: created.id,
      questionId: created.questionId,
      code: created.code,
      label: created.label,
      order: created.order,
      ...(created.metadata ? { metadata: created.metadata as Record<string, unknown> } : {}),
    };
  }

  async updateQuestionOption(input: {
    id: UUID;
    label?: string;
    order?: number;
    metadata?: Record<string, unknown>;
  }): Promise<QuestionOption> {
    const current = await prisma.questionOption.findUnique({
      where: { id: input.id },
      include: { question: true },
    });
    if (!current) throw new Error('Question option not found');
    await assertDraftVersion(current.question.assessmentVersionId);

    const updated = await prisma.questionOption.update({
      where: { id: input.id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.order !== undefined ? { order: input.order } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });

    return {
      id: updated.id,
      questionId: updated.questionId,
      code: updated.code,
      label: updated.label,
      order: updated.order,
      ...(updated.metadata ? { metadata: updated.metadata as Record<string, unknown> } : {}),
    };
  }

  async removeQuestionOption(id: UUID): Promise<void> {
    const current = await prisma.questionOption.findFirst({
      where: { id, question: { assessmentVersion: { tenantId: getTenantId() } } },
      include: { question: true },
    });
    if (!current) throw new Error('Question option not found');
    await assertDraftVersion(current.question.assessmentVersionId);

    await prisma.$transaction(async (tx) => {
      await tx.scoringRule.deleteMany({ where: { optionId: id } });
      await tx.questionOption.delete({ where: { id } });
    });
  }

  async addScoringRule(input: {
    assessmentVersionId: UUID;
    questionId: UUID;
    optionId: UUID;
    impacts: ScoringRule['impacts'];
  }): Promise<ScoringRule> {
    await assertDraftVersion(input.assessmentVersionId);
    const created = await prisma.scoringRule.create({
      data: {
        assessmentVersionId: input.assessmentVersionId,
        questionId: input.questionId,
        optionId: input.optionId,
        impacts: input.impacts,
      },
    });

    return {
      id: created.id,
      assessmentVersionId: created.assessmentVersionId,
      questionId: created.questionId,
      optionId: created.optionId,
      impacts: parseImpacts(created.impacts),
    };
  }

  async updateScoringRule(input: {
    id: UUID;
    impacts?: ScoringRule['impacts'];
    questionId?: UUID;
    optionId?: UUID;
  }): Promise<ScoringRule> {
    const current = await prisma.scoringRule.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Scoring rule not found');
    await assertDraftVersion(current.assessmentVersionId);

    const updated = await prisma.scoringRule.update({
      where: { id: input.id },
      data: {
        ...(input.impacts !== undefined ? { impacts: input.impacts } : {}),
        ...(input.questionId !== undefined ? { questionId: input.questionId } : {}),
        ...(input.optionId !== undefined ? { optionId: input.optionId } : {}),
      },
    });

    return {
      id: updated.id,
      assessmentVersionId: updated.assessmentVersionId,
      questionId: updated.questionId,
      optionId: updated.optionId,
      impacts: parseImpacts(updated.impacts),
    };
  }

  async removeScoringRule(id: UUID): Promise<void> {
    const current = await prisma.scoringRule.findFirst({ where: { id, assessmentVersion: { tenantId: getTenantId() } } });
    if (!current) throw new Error('Scoring rule not found');
    await assertDraftVersion(current.assessmentVersionId);
    await prisma.scoringRule.delete({ where: { id } });
  }
}
