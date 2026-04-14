import { ApiKeyService } from '../src/services/api-key.js';
import { prisma } from '../src/services/prisma.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ASSESSMENT_ID = '22222222-2222-4222-8222-222222222222';
const ASSESSMENT_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const INITIAL_API_KEY_NAME = 'Initial Bootstrap Key';

const LIKERT_OPTIONS = [
  { code: 'strongly_disagree', label: 'Strongly disagree', order: 1, intensity: 0 },
  { code: 'disagree', label: 'Disagree', order: 2, intensity: 1 },
  { code: 'neutral', label: 'Neither agree nor disagree', order: 3, intensity: 2 },
  { code: 'agree', label: 'Agree', order: 4, intensity: 3 },
  { code: 'strongly_agree', label: 'Strongly agree', order: 5, intensity: 4 },
] as const;

const DIMENSIONS = [
  { key: 'D', label: 'Dominance', order: 1 },
  { key: 'I', label: 'Influence', order: 2 },
  { key: 'S', label: 'Steadiness', order: 3 },
  { key: 'C', label: 'Conscientiousness', order: 4 },
] as const;

const QUESTIONS = [
  {
    code: 'Q1',
    prompt: 'I am comfortable taking charge when quick decisions are needed.',
    order: 1,
    dimensionKey: 'D',
    axis: 'tempo',
    axisDirection: 'highTempo',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q2',
    prompt: 'I push for ambitious targets, even when the path is uncertain.',
    order: 2,
    dimensionKey: 'D',
    axis: 'focus',
    axisDirection: 'taskFocus',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q3',
    prompt: 'I avoid confrontation, even when a direct conversation would solve the issue.',
    order: 3,
    dimensionKey: 'D',
    axis: 'tempo',
    axisDirection: 'highTempo',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q1',
  },
  {
    code: 'Q4',
    prompt: 'I am hesitant to make decisions before every detail is known.',
    order: 4,
    dimensionKey: 'D',
    axis: 'focus',
    axisDirection: 'taskFocus',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q2',
  },
  {
    code: 'Q5',
    prompt: 'I naturally start conversations and build rapport with new people.',
    order: 5,
    dimensionKey: 'I',
    axis: 'tempo',
    axisDirection: 'highTempo',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q6',
    prompt: 'I enjoy energizing a group around a new idea.',
    order: 6,
    dimensionKey: 'I',
    axis: 'focus',
    axisDirection: 'peopleFocus',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q7',
    prompt: 'I keep communication brief and mostly task-focused rather than social.',
    order: 7,
    dimensionKey: 'I',
    axis: 'tempo',
    axisDirection: 'highTempo',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q5',
  },
  {
    code: 'Q8',
    prompt: 'I prefer to persuade with data alone instead of enthusiasm and storytelling.',
    order: 8,
    dimensionKey: 'I',
    axis: 'focus',
    axisDirection: 'peopleFocus',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q6',
  },
  {
    code: 'Q9',
    prompt: 'I stay patient and steady when work becomes stressful.',
    order: 9,
    dimensionKey: 'S',
    axis: 'tempo',
    axisDirection: 'lowTempo',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q10',
    prompt: 'I am dependable about following through on commitments over time.',
    order: 10,
    dimensionKey: 'S',
    axis: 'focus',
    axisDirection: 'peopleFocus',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q11',
    prompt: 'Frequent shifts in priorities keep me motivated and focused.',
    order: 11,
    dimensionKey: 'S',
    axis: 'tempo',
    axisDirection: 'lowTempo',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q9',
  },
  {
    code: 'Q12',
    prompt: 'I get restless when work routines stay consistent for long periods.',
    order: 12,
    dimensionKey: 'S',
    axis: 'focus',
    axisDirection: 'peopleFocus',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q10',
  },
  {
    code: 'Q13',
    prompt: 'I check details carefully before I consider a task complete.',
    order: 13,
    dimensionKey: 'C',
    axis: 'focus',
    axisDirection: 'taskFocus',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q14',
    prompt: 'I prefer clear standards and defined processes when delivering work.',
    order: 14,
    dimensionKey: 'C',
    axis: 'tempo',
    axisDirection: 'lowTempo',
    reverseScored: false,
    role: 'core',
  },
  {
    code: 'Q15',
    prompt: 'Strict procedures usually slow progress more than they improve quality.',
    order: 15,
    dimensionKey: 'C',
    axis: 'focus',
    axisDirection: 'taskFocus',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q13',
  },
  {
    code: 'Q16',
    prompt: 'I am comfortable submitting work without reviewing it for errors first.',
    order: 16,
    dimensionKey: 'C',
    axis: 'tempo',
    axisDirection: 'lowTempo',
    reverseScored: true,
    role: 'mirror',
    mirrorOf: 'Q14',
  },
] as const;

async function main() {
  const apiKeyService = new ApiKeyService();

  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { name: 'Default Tenant' },
    create: {
      id: TENANT_ID,
      name: 'Default Tenant',
      externalId: 'default',
    },
  });

  await prisma.assessmentDefinition.upsert({
    where: {
      tenantId_key: {
        tenantId: TENANT_ID,
        key: 'disc-core',
      },
    },
    update: {
      id: ASSESSMENT_ID,
      name: 'DISC Core Assessment',
      description: 'DISC v1 (Likert-format) with deterministic D/I/S/C scoring rules.',
    },
    create: {
      id: ASSESSMENT_ID,
      tenantId: TENANT_ID,
      key: 'disc-core',
      name: 'DISC Core Assessment',
      description: 'DISC v1 (Likert-format) with deterministic D/I/S/C scoring rules.',
    },
  });

  await prisma.assessmentVersion.upsert({
    where: { id: ASSESSMENT_VERSION_ID },
    update: {
      tenantId: TENANT_ID,
      assessmentDefinitionId: ASSESSMENT_ID,
      scoringVersion: 'disc-v1-likert-16',
      versionNumber: 1,
      status: 'published',
      questionCount: QUESTIONS.length,
      publishedAt: new Date(),
      immutableAt: new Date(),
    },
    create: {
      id: ASSESSMENT_VERSION_ID,
      tenantId: TENANT_ID,
      assessmentDefinitionId: ASSESSMENT_ID,
      scoringVersion: 'disc-v1-likert-16',
      versionNumber: 1,
      status: 'published',
      questionCount: QUESTIONS.length,
      publishedAt: new Date(),
      immutableAt: new Date(),
    },
  });

  await prisma.scoreDimension.deleteMany({
    where: {
      assessmentVersionId: ASSESSMENT_VERSION_ID,
      key: { notIn: DIMENSIONS.map((dimension) => dimension.key) },
    },
  });

  for (const dimension of DIMENSIONS) {
    await prisma.scoreDimension.upsert({
      where: {
        assessmentVersionId_key: {
          assessmentVersionId: ASSESSMENT_VERSION_ID,
          key: dimension.key,
        },
      },
      update: {
        label: dimension.label,
        order: dimension.order,
      },
      create: {
        assessmentVersionId: ASSESSMENT_VERSION_ID,
        key: dimension.key,
        label: dimension.label,
        order: dimension.order,
      },
    });
  }

  const existingBootstrapKeys = await prisma.apiKey.findMany({
    where: {
      tenantId: TENANT_ID,
      name: INITIAL_API_KEY_NAME,
    },
    select: { id: true },
  });

  if (existingBootstrapKeys.length > 0) {
    await prisma.apiKey.deleteMany({
      where: {
        id: { in: existingBootstrapKeys.map((key) => key.id) },
      },
    });
  }

  const bootstrapApiKey = await apiKeyService.createApiKey({
    tenantId: TENANT_ID,
    name: INITIAL_API_KEY_NAME,
  });

  for (const question of QUESTIONS) {
    const persistedQuestion = await prisma.question.upsert({
      where: {
        assessmentVersionId_code: {
          assessmentVersionId: ASSESSMENT_VERSION_ID,
          code: question.code,
        },
      },
      update: {
        prompt: question.prompt,
        order: question.order,
        type: 'single_choice',
        required: true,
        metadata: {
          discDimension: question.dimensionKey,
          reverseScored: question.reverseScored,
          axis: question.axis,
          axisDirection: question.axisDirection,
          weight: 1,
          reverseKeyed: question.reverseScored,
          role: question.role,
          ...(question.mirrorOf ? { mirrorOf: question.mirrorOf } : {}),
        },
      },
      create: {
        assessmentVersionId: ASSESSMENT_VERSION_ID,
        code: question.code,
        prompt: question.prompt,
        order: question.order,
        type: 'single_choice',
        required: true,
        metadata: {
          discDimension: question.dimensionKey,
          reverseScored: question.reverseScored,
          axis: question.axis,
          axisDirection: question.axisDirection,
          weight: 1,
          reverseKeyed: question.reverseScored,
          role: question.role,
          ...(question.mirrorOf ? { mirrorOf: question.mirrorOf } : {}),
        },
      },
      select: { id: true },
    });

    await prisma.questionOption.deleteMany({
      where: {
        questionId: persistedQuestion.id,
        code: { notIn: LIKERT_OPTIONS.map((option) => option.code) },
      },
    });

    for (const option of LIKERT_OPTIONS) {
      const persistedOption = await prisma.questionOption.upsert({
        where: {
          questionId_code: {
            questionId: persistedQuestion.id,
            code: option.code,
          },
        },
        update: {
          label: option.label,
          order: option.order,
          metadata: { intensity: option.intensity },
        },
        create: {
          questionId: persistedQuestion.id,
          code: option.code,
          label: option.label,
          order: option.order,
          metadata: { intensity: option.intensity },
        },
        select: { id: true },
      });

      const weight = question.reverseScored ? 4 - option.intensity : option.intensity;

      await prisma.scoringRule.deleteMany({
        where: {
          questionId: persistedQuestion.id,
          optionId: persistedOption.id,
        },
      });

      await prisma.scoringRule.create({
        data: {
          assessmentVersionId: ASSESSMENT_VERSION_ID,
          questionId: persistedQuestion.id,
          optionId: persistedOption.id,
          impacts: [
            {
              dimensionKey: question.dimensionKey,
              weight,
            },
          ],
        },
      });
    }

    await prisma.scoringRule.deleteMany({
      where: {
        questionId: persistedQuestion.id,
        option: {
          code: { notIn: LIKERT_OPTIONS.map((option) => option.code) },
        },
      },
    });
  }

  await prisma.assessmentVersion.update({
    where: { id: ASSESSMENT_VERSION_ID },
    data: { questionCount: QUESTIONS.length },
  });

  console.log('Seed complete.');
  console.log(`tenantId=${TENANT_ID}`);
  console.log(`BOOTSTRAP API KEY: ${bootstrapApiKey.rawKey}`);
  console.log(`assessmentDefinitionId=${ASSESSMENT_ID}`);
  console.log(`assessmentVersionId=${ASSESSMENT_VERSION_ID}`);
}

main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
