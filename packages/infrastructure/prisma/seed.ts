import { ApiKeyService } from '../src/services/api-key.js';
import { prisma } from '../src/services/prisma.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ASSESSMENT_ID = '22222222-2222-4222-8222-222222222222';
const FREE_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const STANDARD_VERSION_ID = '44444444-4444-4444-8444-444444444444';
const DEEP_VERSION_ID = '55555555-5555-4555-8555-555555555555';
const INITIAL_API_KEY_NAME = 'Initial Bootstrap Key';

type DiscDimension = 'D' | 'I' | 'S' | 'C';
type TierKey = 'free' | 'standard' | 'deep';

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

const dimensionConfig: Record<
  DiscDimension,
  {
    axis: 'tempo' | 'focus';
    axisDirection: 'highTempo' | 'lowTempo' | 'taskFocus' | 'peopleFocus';
    positive: string[];
    reverse: string[];
  }
> = {
  D: {
    axis: 'tempo',
    axisDirection: 'highTempo',
    positive: [
      'I step forward quickly when decisions are needed.',
      'I am comfortable setting direction when goals are unclear.',
      'I move projects ahead even when there is resistance.',
      'I take ownership when outcomes are on the line.',
      'I speak up directly when a decision is stalled.',
      'I can make firm calls with limited information.',
      'I challenge slow progress when urgency is needed.',
      'I am energized by high-pressure goals.',
      'I can reset priorities rapidly when conditions change.',
      'I make decisive trade-offs to keep momentum.',
    ],
    reverse: [
      'I delay decisions until every detail is settled.',
      'I avoid taking charge when priorities conflict.',
      'I hold back from acting unless others go first.',
      'I hesitate to set direction in uncertain situations.',
      'I prefer to wait rather than make a difficult call.',
      'I avoid assertive conversations, even when needed.',
      'I postpone action when outcomes feel risky.',
      'I am uncomfortable leading fast-moving situations.',
      'I tend to defer major decisions to others.',
      'I slow momentum by overchecking whether to proceed.',
    ],
  },
  I: {
    axis: 'focus',
    axisDirection: 'peopleFocus',
    positive: [
      'I naturally build energy in group conversations.',
      'I enjoy connecting people around new ideas.',
      'I communicate enthusiasm when starting initiatives.',
      'I form rapport quickly with new teammates.',
      'I motivate others through encouragement and visibility.',
      'I can keep morale strong during ambiguous work.',
      'I bring people into discussions before finalizing plans.',
      'I often notice social dynamics before others do.',
      'I prefer collaborative conversations over isolated work.',
      'I use storytelling to gain alignment.',
    ],
    reverse: [
      'I keep communication purely transactional.',
      'I avoid social engagement unless it is required.',
      'I prefer working alone rather than energizing a team.',
      'I rarely initiate conversations with unfamiliar people.',
      'I focus on tasks and skip relationship-building.',
      'I leave motivation to others on the team.',
      'I avoid emotional context when communicating change.',
      'I limit collaboration to reduce interpersonal complexity.',
      'I prefer data-only persuasion over social influence.',
      'I feel drained by group interaction and outreach.',
    ],
  },
  S: {
    axis: 'tempo',
    axisDirection: 'lowTempo',
    positive: [
      'I remain calm and steady during disruption.',
      'I am consistent in how I support others over time.',
      'I keep follow-through strong across long projects.',
      'I provide dependable structure for team routines.',
      'I stay patient when plans need gradual execution.',
      'I value continuity when priorities are shifting.',
      'I help teams settle after high-pressure cycles.',
      'I preserve reliability when workloads increase.',
      'I sustain progress with disciplined pacing.',
      'I am comfortable with repetition when quality matters.',
    ],
    reverse: [
      'I get restless when routines stay stable for too long.',
      'I lose focus when execution requires steady pacing.',
      'I prefer frequent change over consistency.',
      'I move on quickly rather than maintain continuity.',
      'I struggle to stay patient with gradual progress.',
      'I deprioritize follow-through once urgency fades.',
      'I am uncomfortable with predictable work rhythms.',
      'I abandon routines when new options appear.',
      'I push for novelty even when stability is needed.',
      'I find it hard to remain measured under stress.',
    ],
  },
  C: {
    axis: 'focus',
    axisDirection: 'taskFocus',
    positive: [
      'I verify details before considering work complete.',
      'I rely on clear standards to deliver consistent quality.',
      'I plan thoroughly before execution begins.',
      'I prefer structured processes for complex tasks.',
      'I check assumptions before making recommendations.',
      'I document key decisions to reduce avoidable errors.',
      'I value precision when evaluating trade-offs.',
      'I identify risk conditions before launch.',
      'I test outputs against agreed quality criteria.',
      'I am attentive to compliance and constraints.',
    ],
    reverse: [
      'I skip detailed checks to move faster.',
      'I resist structured processes even on complex work.',
      'I rely on intuition instead of verification.',
      'I treat standards as optional under time pressure.',
      'I rarely review assumptions before committing.',
      'I avoid documentation unless someone requests it.',
      'I accept rough quality when deadlines are tight.',
      'I move ahead without clarifying constraints.',
      'I consider precision less important than speed.',
      'I finalize work before confirming error risk.',
    ],
  },
};

const contexts = [
  'in high-stakes work situations.',
  'when priorities change quickly.',
  'during cross-functional collaboration.',
  'while handling uncertain goals.',
  'when deadlines are close.',
  'in routine operational work.',
] as const;

const buildQuestionBank = (count: number) => {
  const dimensions: DiscDimension[] = ['D', 'I', 'S', 'C'];
  const items: Array<{
    code: string;
    prompt: string;
    order: number;
    dimensionKey: DiscDimension;
    axis: 'tempo' | 'focus';
    axisDirection: 'highTempo' | 'lowTempo' | 'taskFocus' | 'peopleFocus';
    reverseScored: boolean;
    role: 'core' | 'mirror' | 'tiebreaker';
    mirrorOf?: string;
    itemPoolGroups: string[];
    routingTags: string[];
    uncertaintyTargets: string[];
  }> = [];

  for (let index = 1; index <= count; index += 1) {
    const dimension = dimensions[(index - 1) % dimensions.length];
    const config = dimensionConfig[dimension];
    const isMirror = index % 2 === 0;
    const isTieBreaker = index % 10 === 0;
    const phraseIndex = Math.floor((index - 1) / dimensions.length) % config.positive.length;
    const context = contexts[(index - 1) % contexts.length];
    const code = `Q${index}`;

    items.push({
      code,
      prompt: `${(isMirror ? config.reverse : config.positive)[phraseIndex]} ${context}`,
      order: index,
      dimensionKey: dimension,
      axis: config.axis,
      axisDirection: config.axisDirection,
      reverseScored: isMirror,
      role: isTieBreaker ? 'tiebreaker' : isMirror ? 'mirror' : 'core',
      ...(isMirror ? { mirrorOf: `Q${index - 1}` } : {}),
      itemPoolGroups: [
        `${dimension.toLowerCase()}-${config.axisDirection}`,
        isTieBreaker ? 'disambiguation' : 'core-coverage',
      ],
      routingTags: [
        dimension === 'D' || dimension === 'I' ? 'high-expression' : 'stability-or-precision',
        isMirror ? 'mirror-check' : 'direct-trait',
      ],
      uncertaintyTargets: [
        `${dimension.toLowerCase()}-confidence`,
        isTieBreaker ? `${dimension.toLowerCase()}-tie-break` : `${dimension.toLowerCase()}-baseline`,
      ],
    });
  }

  return items;
};

const ITEM_BANK = buildQuestionBank(96);

const assessmentVersions: Array<{
  id: string;
  versionNumber: number;
  scoringVersion: string;
  metadata: {
    assessmentVersionKey: string;
    tier: TierKey;
    intendedUse: string;
    expectedItemCount: number;
    expectedCompletionTimeMinutes: number;
    form: 'fixed_form' | 'future_adaptive_ready';
    contextFrame?: string;
    adaptive: {
      adaptiveEligible: boolean;
      itemPoolGroupIds: string[];
      uncertaintyTargetAreas: string[];
      routingTags: string[];
    };
  };
  questions: typeof ITEM_BANK;
}> = [
  {
    id: FREE_VERSION_ID,
    versionNumber: 1,
    scoringVersion: 'disc-v2-free-16',
    metadata: {
      assessmentVersionKey: 'disc-free-16',
      tier: 'free',
      intendedUse: 'Short DISC screening for lightweight intake.',
      expectedItemCount: 16,
      expectedCompletionTimeMinutes: 6,
      form: 'fixed_form',
      contextFrame: 'general',
      adaptive: {
        adaptiveEligible: false,
        itemPoolGroupIds: ['screening-core'],
        uncertaintyTargetAreas: ['top-dimension-confidence'],
        routingTags: ['screening'],
      },
    },
    questions: ITEM_BANK.slice(0, 16),
  },
  {
    id: STANDARD_VERSION_ID,
    versionNumber: 2,
    scoringVersion: 'disc-v2-standard-30',
    metadata: {
      assessmentVersionKey: 'disc-standard-30',
      tier: 'standard',
      intendedUse: 'Balanced DISC profile for routine coaching and team development.',
      expectedItemCount: 30,
      expectedCompletionTimeMinutes: 11,
      form: 'future_adaptive_ready',
      contextFrame: 'work',
      adaptive: {
        adaptiveEligible: true,
        itemPoolGroupIds: ['screening-core', 'expanded-coverage', 'mirror-checks'],
        uncertaintyTargetAreas: ['secondary-dimension-separation', 'mirror-consistency'],
        routingTags: ['standard', 'expanded'],
      },
    },
    questions: ITEM_BANK.slice(0, 30),
  },
  {
    id: DEEP_VERSION_ID,
    versionNumber: 3,
    scoringVersion: 'disc-v2-deep-80',
    metadata: {
      assessmentVersionKey: 'disc-deep-80',
      tier: 'deep',
      intendedUse: 'Higher-stability DISC profile with broader coverage and disambiguation depth.',
      expectedItemCount: 80,
      expectedCompletionTimeMinutes: 28,
      form: 'future_adaptive_ready',
      contextFrame: 'work-and-general',
      adaptive: {
        adaptiveEligible: true,
        itemPoolGroupIds: ['screening-core', 'expanded-coverage', 'mirror-checks', 'disambiguation'],
        uncertaintyTargetAreas: [
          'secondary-dimension-separation',
          'profile-stability-under-noise',
          'mirror-consistency',
        ],
        routingTags: ['deep', 'stability', 'future-cat-routing'],
      },
    },
    questions: ITEM_BANK.slice(0, 80),
  },
];

const syncVersionContent = async (
  versionId: string,
  questions: typeof ITEM_BANK,
  scoringVersion: string,
) => {
  await prisma.question.deleteMany({
    where: {
      assessmentVersionId: versionId,
      code: { notIn: questions.map((question) => question.code) },
    },
  });

  for (const question of questions) {
    const persistedQuestion = await prisma.question.upsert({
      where: {
        assessmentVersionId_code: {
          assessmentVersionId: versionId,
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
          weight: question.role === 'tiebreaker' ? 0.75 : 1,
          reverseKeyed: question.reverseScored,
          role: question.role,
          itemPoolGroups: question.itemPoolGroups,
          routingTags: question.routingTags,
          uncertaintyTargets: question.uncertaintyTargets,
          adaptiveEligible: scoringVersion !== 'disc-v2-free-16',
          ...(question.mirrorOf ? { mirrorOf: question.mirrorOf } : {}),
        },
      },
      create: {
        assessmentVersionId: versionId,
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
          weight: question.role === 'tiebreaker' ? 0.75 : 1,
          reverseKeyed: question.reverseScored,
          role: question.role,
          itemPoolGroups: question.itemPoolGroups,
          routingTags: question.routingTags,
          uncertaintyTargets: question.uncertaintyTargets,
          adaptiveEligible: scoringVersion !== 'disc-v2-free-16',
          ...(question.mirrorOf ? { mirrorOf: question.mirrorOf } : {}),
        },
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
          metadata: {
            intensity: option.intensity,
          },
        },
        create: {
          questionId: persistedQuestion.id,
          code: option.code,
          label: option.label,
          order: option.order,
          metadata: {
            intensity: option.intensity,
          },
        },
      });

      const normalizedValue = question.reverseScored ? 4 - option.intensity : option.intensity;
      const impactWeight = normalizedValue * (question.role === 'tiebreaker' ? 0.75 : 1);

      await prisma.scoringRule.upsert({
        where: {
          id: `${versionId}-${persistedQuestion.id}-${persistedOption.id}`,
        },
        update: {
          impacts: [{ dimensionKey: question.dimensionKey, weight: impactWeight }],
        },
        create: {
          id: `${versionId}-${persistedQuestion.id}-${persistedOption.id}`,
          assessmentVersionId: versionId,
          questionId: persistedQuestion.id,
          optionId: persistedOption.id,
          impacts: [{ dimensionKey: question.dimensionKey, weight: impactWeight }],
        },
      });
    }
  }
};

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
      productLine: 'disc',
      name: 'DISC Structured Product Line',
      description:
        'Evidence-informed DISC family with explicit free, standard, and deep fixed-form versions and CAT-ready metadata.',
    },
    create: {
      id: ASSESSMENT_ID,
      tenantId: TENANT_ID,
      productLine: 'disc',
      key: 'disc-core',
      name: 'DISC Structured Product Line',
      description:
        'Evidence-informed DISC family with explicit free, standard, and deep fixed-form versions and CAT-ready metadata.',
    },
  });

  for (const version of assessmentVersions) {
    await prisma.assessmentVersion.upsert({
      where: { id: version.id },
      update: {
        tenantId: TENANT_ID,
        assessmentDefinitionId: ASSESSMENT_ID,
        scoringVersion: version.scoringVersion,
        assessmentVersionKey: version.metadata.assessmentVersionKey,
        tier: version.metadata.tier,
        intendedUse: version.metadata.intendedUse,
        contextFrame: version.metadata.contextFrame ?? null,
        expectedItemCount: version.metadata.expectedItemCount,
        expectedCompletionTimeMinutes: version.metadata.expectedCompletionTimeMinutes,
        form: version.metadata.form,
        adaptiveMetadata: version.metadata,
        versionNumber: version.versionNumber,
        status: 'published',
        questionCount: version.questions.length,
        publishedAt: new Date(),
        immutableAt: new Date(),
      },
      create: {
        id: version.id,
        tenantId: TENANT_ID,
        assessmentDefinitionId: ASSESSMENT_ID,
        scoringVersion: version.scoringVersion,
        assessmentVersionKey: version.metadata.assessmentVersionKey,
        tier: version.metadata.tier,
        intendedUse: version.metadata.intendedUse,
        contextFrame: version.metadata.contextFrame ?? null,
        expectedItemCount: version.metadata.expectedItemCount,
        expectedCompletionTimeMinutes: version.metadata.expectedCompletionTimeMinutes,
        form: version.metadata.form,
        adaptiveMetadata: version.metadata,
        versionNumber: version.versionNumber,
        status: 'published',
        questionCount: version.questions.length,
        publishedAt: new Date(),
        immutableAt: new Date(),
      },
    });

    await prisma.scoreDimension.deleteMany({
      where: {
        assessmentVersionId: version.id,
        key: { notIn: DIMENSIONS.map((dimension) => dimension.key) },
      },
    });

    for (const dimension of DIMENSIONS) {
      await prisma.scoreDimension.upsert({
        where: {
          assessmentVersionId_key: {
            assessmentVersionId: version.id,
            key: dimension.key,
          },
        },
        update: {
          label: dimension.label,
          order: dimension.order,
        },
        create: {
          assessmentVersionId: version.id,
          key: dimension.key,
          label: dimension.label,
          order: dimension.order,
        },
      });
    }

    await syncVersionContent(version.id, version.questions, version.scoringVersion);
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

  console.log('DISC assessment family seeded successfully');
  console.log('Assessment definition id:', ASSESSMENT_ID);
  console.log(
    'Assessment versions:',
    assessmentVersions.map((version) => `${version.metadata.assessmentVersionKey}=${version.id}`).join(', '),
  );
  console.log('Bootstrap API key (store securely):', bootstrapApiKey.plaintextKey);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
