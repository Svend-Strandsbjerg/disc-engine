import { ApiKeyService } from '../src/services/api-key.js';
import { prisma } from '../src/services/prisma.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ASSESSMENT_ID = '22222222-2222-4222-8222-222222222222';
const ASSESSMENT_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const INITIAL_API_KEY_NAME = 'Initial Bootstrap Key';

const QUESTION_IDS = [
  '44444444-4444-4444-8444-444444444441',
  '44444444-4444-4444-8444-444444444442',
  '44444444-4444-4444-8444-444444444443',
  '44444444-4444-4444-8444-444444444444',
] as const;

const OPTION_IDS = {
  q1: [
    '55555555-5555-4555-8555-555555555511',
    '55555555-5555-4555-8555-555555555512',
  ],
  q2: [
    '55555555-5555-4555-8555-555555555521',
    '55555555-5555-4555-8555-555555555522',
  ],
  q3: [
    '55555555-5555-4555-8555-555555555531',
    '55555555-5555-4555-8555-555555555532',
  ],
  q4: [
    '55555555-5555-4555-8555-555555555541',
    '55555555-5555-4555-8555-555555555542',
  ],
} as const;

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
      description: 'Minimal seeded DISC assessment for session/response APIs.',
    },
    create: {
      id: ASSESSMENT_ID,
      tenantId: TENANT_ID,
      key: 'disc-core',
      name: 'DISC Core Assessment',
      description: 'Minimal seeded DISC assessment for session/response APIs.',
    },
  });

  await prisma.assessmentVersion.upsert({
    where: { id: ASSESSMENT_VERSION_ID },
    update: {
      tenantId: TENANT_ID,
      assessmentDefinitionId: ASSESSMENT_ID,
      scoringVersion: 'disc-v1',
      versionNumber: 1,
      status: 'published',
      questionCount: QUESTION_IDS.length,
      publishedAt: new Date(),
      immutableAt: new Date(),
    },
    create: {
      id: ASSESSMENT_VERSION_ID,
      tenantId: TENANT_ID,
      assessmentDefinitionId: ASSESSMENT_ID,
      scoringVersion: 'disc-v1',
      versionNumber: 1,
      status: 'published',
      questionCount: QUESTION_IDS.length,
      publishedAt: new Date(),
      immutableAt: new Date(),
    },
  });

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

  const questions = [
    {
      id: QUESTION_IDS[0],
      code: 'Q1',
      prompt: 'In a new project, I naturally take the lead.',
      order: 1,
      options: [
        { id: OPTION_IDS.q1[0], code: 'agree', label: 'Agree', order: 1 },
        { id: OPTION_IDS.q1[1], code: 'disagree', label: 'Disagree', order: 2 },
      ],
    },
    {
      id: QUESTION_IDS[1],
      code: 'Q2',
      prompt: 'I prioritize keeping harmony within the team.',
      order: 2,
      options: [
        { id: OPTION_IDS.q2[0], code: 'agree', label: 'Agree', order: 1 },
        { id: OPTION_IDS.q2[1], code: 'disagree', label: 'Disagree', order: 2 },
      ],
    },
    {
      id: QUESTION_IDS[2],
      code: 'Q3',
      prompt: 'I enjoy following clear processes and checklists.',
      order: 3,
      options: [
        { id: OPTION_IDS.q3[0], code: 'agree', label: 'Agree', order: 1 },
        { id: OPTION_IDS.q3[1], code: 'disagree', label: 'Disagree', order: 2 },
      ],
    },
    {
      id: QUESTION_IDS[3],
      code: 'Q4',
      prompt: 'I am energized by persuading others to try new ideas.',
      order: 4,
      options: [
        { id: OPTION_IDS.q4[0], code: 'agree', label: 'Agree', order: 1 },
        { id: OPTION_IDS.q4[1], code: 'disagree', label: 'Disagree', order: 2 },
      ],
    },
  ] as const;

  for (const question of questions) {
    await prisma.question.upsert({
      where: {
        assessmentVersionId_code: {
          assessmentVersionId: ASSESSMENT_VERSION_ID,
          code: question.code,
        },
      },
      update: {
        id: question.id,
        prompt: question.prompt,
        order: question.order,
        type: 'single_choice',
        required: true,
      },
      create: {
        id: question.id,
        assessmentVersionId: ASSESSMENT_VERSION_ID,
        code: question.code,
        prompt: question.prompt,
        order: question.order,
        type: 'single_choice',
        required: true,
      },
    });

    for (const option of question.options) {
      await prisma.questionOption.upsert({
        where: {
          questionId_code: {
            questionId: question.id,
            code: option.code,
          },
        },
        update: {
          id: option.id,
          label: option.label,
          order: option.order,
        },
        create: {
          id: option.id,
          questionId: question.id,
          code: option.code,
          label: option.label,
          order: option.order,
        },
      });
    }
  }

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
