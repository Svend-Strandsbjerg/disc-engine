import { ApiKeyService } from '../src/services/api-key.js';
import { prisma } from '../src/services/prisma.js';
import {
  PrismaAssessmentRepository,
  PrismaCandidateItemRepository,
  runWithAccessContext,
} from '../src/index.js';
import { runCandidateItemAuthoringWorkflow } from '@disc-foundation/application';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ASSESSMENT_ID = '22222222-2222-4222-8222-222222222222';
const FREE_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const STANDARD_VERSION_ID = '44444444-4444-4444-8444-444444444444';
const DEEP_VERSION_ID = '55555555-5555-4555-8555-555555555555';
const INITIAL_API_KEY_NAME = 'Initial Bootstrap Key';
const STANDARD_DRAFT_ITERATION_VERSION_KEY = 'disc-standard-30-draft-internal-eval-1';
const STANDARD_DRAFT_ITERATION_SCORING_VERSION = 'disc-v2-standard-30-draft-internal-eval-1';

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
type BankItem = (typeof ITEM_BANK)[number];

const selectCuratedItems = (codes: readonly string[]): BankItem[] => {
  const selected = codes.map((code) => {
    const item = ITEM_BANK.find((candidate) => candidate.code === code);
    if (!item) {
      throw new Error(`Curated composition references unknown item code: ${code}`);
    }
    return item;
  });

  const seen = new Set<string>();
  for (const item of selected) {
    if (seen.has(item.code)) {
      throw new Error(`Curated composition contains duplicate item code: ${item.code}`);
    }
    seen.add(item.code);
  }

  return selected.map((item, index) => ({ ...item, order: index + 1 }));
};

const FREE_16_CODES = [
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'Q5',
  'Q6',
  'Q7',
  'Q8',
  'Q17',
  'Q18',
  'Q19',
  'Q20',
  'Q21',
  'Q22',
  'Q23',
  'Q24',
] as const;

const STANDARD_30_CODES = [
  ...FREE_16_CODES,
  'Q25',
  'Q26',
  'Q27',
  'Q28',
  'Q29',
  'Q30',
  'Q33',
  'Q34',
  'Q35',
  'Q36',
  'Q37',
  'Q38',
  'Q39',
  'Q40',
] as const;

const DEEP_80_CODES = Array.from({ length: 80 }, (_, index) => `Q${index + 1}`);

const summarizeComposition = (questions: BankItem[]) => {
  const axisDistribution = {
    tempo: questions.filter((question) => question.axis === 'tempo').length,
    focus: questions.filter((question) => question.axis === 'focus').length,
    axisDirection: {
      highTempo: questions.filter((question) => question.axisDirection === 'highTempo').length,
      lowTempo: questions.filter((question) => question.axisDirection === 'lowTempo').length,
      peopleFocus: questions.filter((question) => question.axisDirection === 'peopleFocus').length,
      taskFocus: questions.filter((question) => question.axisDirection === 'taskFocus').length,
    },
  };
  const roleDistribution = {
    core: questions.filter((question) => question.role === 'core').length,
    mirror: questions.filter((question) => question.role === 'mirror').length,
    tiebreaker: questions.filter((question) => question.role === 'tiebreaker').length,
  };
  const reverseKeyedCount = questions.filter((question) => question.reverseScored).length;
  const mirroredItems = questions.filter((question) => question.mirrorOf);
  const selectedCodes = new Set(questions.map((question) => question.code));
  const completeMirrorPairs = mirroredItems.filter(
    (question) => question.mirrorOf && selectedCodes.has(question.mirrorOf),
  ).length;
  const tiebreakerByAxisDirection = {
    highTempo: questions.filter(
      (question) => question.role === 'tiebreaker' && question.axisDirection === 'highTempo',
    ).length,
    lowTempo: questions.filter(
      (question) => question.role === 'tiebreaker' && question.axisDirection === 'lowTempo',
    ).length,
    peopleFocus: questions.filter(
      (question) => question.role === 'tiebreaker' && question.axisDirection === 'peopleFocus',
    ).length,
    taskFocus: questions.filter(
      (question) => question.role === 'tiebreaker' && question.axisDirection === 'taskFocus',
    ).length,
  };

  return {
    itemCount: questions.length,
    axisDistribution,
    roleDistribution,
    reverseKeyedCount,
    mirrorCoverage: {
      mirroredItems: mirroredItems.length,
      completeMirrorPairs,
      missingMirrorAnchor: mirroredItems.length - completeMirrorPairs,
    },
    tiebreakerCoverage: {
      count: roleDistribution.tiebreaker,
      byAxisDirection: tiebreakerByAxisDirection,
    },
  };
};

const FREE_16_ITEMS = selectCuratedItems(FREE_16_CODES);
const STANDARD_30_ITEMS = selectCuratedItems(STANDARD_30_CODES);
const DEEP_80_ITEMS = selectCuratedItems(DEEP_80_CODES);

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
    compositionSummary: ReturnType<typeof summarizeComposition>;
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
      compositionSummary: summarizeComposition(FREE_16_ITEMS),
    },
    questions: FREE_16_ITEMS,
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
      compositionSummary: summarizeComposition(STANDARD_30_ITEMS),
    },
    questions: STANDARD_30_ITEMS,
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
      compositionSummary: summarizeComposition(DEEP_80_ITEMS),
    },
    questions: DEEP_80_ITEMS,
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

  const tenant = await prisma.tenant.upsert({
    where: { externalId: 'default' },
    update: { name: 'Default Tenant' },
    create: {
      id: TENANT_ID,
      name: 'Default Tenant',
      externalId: 'default',
    },
  });

  const assessmentDefinition = await prisma.assessmentDefinition.upsert({
    where: {
      tenantId_key: {
        tenantId: tenant.id,
        key: 'disc-core',
      },
    },
    update: {
      productLine: 'disc',
      name: 'DISC Structured Product Line',
      description:
        'Evidence-informed DISC family with explicit free, standard, and deep fixed-form versions and CAT-ready metadata.',
    },
    create: {
      id: ASSESSMENT_ID,
      tenantId: tenant.id,
      productLine: 'disc',
      key: 'disc-core',
      name: 'DISC Structured Product Line',
      description:
        'Evidence-informed DISC family with explicit free, standard, and deep fixed-form versions and CAT-ready metadata.',
    },
  });

  const persistedVersionIdsByKey = new Map<string, string>();

  for (const version of assessmentVersions) {
    const persistedVersion = await prisma.assessmentVersion.upsert({
      where: {
        tenantId_assessmentVersionKey: {
          tenantId: tenant.id,
          assessmentVersionKey: version.metadata.assessmentVersionKey,
        },
      },
      update: {
        tenantId: tenant.id,
        assessmentDefinitionId: assessmentDefinition.id,
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
        tenantId: tenant.id,
        assessmentDefinitionId: assessmentDefinition.id,
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
    persistedVersionIdsByKey.set(version.metadata.assessmentVersionKey, persistedVersion.id);

    await prisma.scoreDimension.deleteMany({
      where: {
        assessmentVersionId: persistedVersion.id,
        key: { notIn: DIMENSIONS.map((dimension) => dimension.key) },
      },
    });

    for (const dimension of DIMENSIONS) {
      await prisma.scoreDimension.upsert({
        where: {
          assessmentVersionId_key: {
            assessmentVersionId: persistedVersion.id,
            key: dimension.key,
          },
        },
        update: {
          label: dimension.label,
          order: dimension.order,
        },
        create: {
          assessmentVersionId: persistedVersion.id,
          key: dimension.key,
          label: dimension.label,
          order: dimension.order,
        },
      });
    }

    await syncVersionContent(persistedVersion.id, version.questions, version.scoringVersion);
  }

  const existingBootstrapKey = await prisma.apiKey.findFirst({
    where: {
      tenantId: tenant.id,
      name: INITIAL_API_KEY_NAME,
    },
    select: { id: true },
  });

  const createdBootstrapApiKey = existingBootstrapKey
    ? null
    : await apiKeyService.createApiKey({
        tenantId: tenant.id,
        name: INITIAL_API_KEY_NAME,
      });
  const bootstrapApiKeyId = existingBootstrapKey?.id ?? createdBootstrapApiKey?.apiKey.id;
  if (!bootstrapApiKeyId) {
    throw new Error('Seed invariant violated: missing bootstrap API key id.');
  }

  const standardVersionId = persistedVersionIdsByKey.get('disc-standard-30');
  if (!standardVersionId) {
    throw new Error('Seed invariant violated: missing persisted disc-standard-30 assessment version.');
  }

  const existingIterationDraft = await prisma.assessmentVersion.findFirst({
    where: { tenantId: tenant.id, assessmentVersionKey: STANDARD_DRAFT_ITERATION_VERSION_KEY },
    select: { id: true, assessmentVersionKey: true },
  });

  if (!existingIterationDraft) {
    const assessmentReadWriteRepository = new PrismaAssessmentRepository();
    const candidateItemRepository = new PrismaCandidateItemRepository();

    const workflowResult = await runWithAccessContext(
      { tenantId: tenant.id, apiKeyId: bootstrapApiKeyId },
      async () =>
        runCandidateItemAuthoringWorkflow(
          {
            candidateItemRepository,
            assessmentReadRepository: assessmentReadWriteRepository,
            assessmentWriteRepository: assessmentReadWriteRepository,
          },
          {
            sourceAssessmentVersionId: standardVersionId,
            targetTier: 'standard',
            draftScoringVersion: STANDARD_DRAFT_ITERATION_SCORING_VERSION,
            draftMetadata: {
              assessmentVersionKey: STANDARD_DRAFT_ITERATION_VERSION_KEY,
              tier: 'standard',
              intendedUse:
                'Internal evaluation draft for first curated candidate-item iteration on standard DISC tier.',
              contextFrame: 'work',
              expectedItemCount: 40,
              expectedCompletionTimeMinutes: 13,
              form: 'future_adaptive_ready',
              adaptive: {
                adaptiveEligible: true,
                itemPoolGroupIds: ['screening-core', 'expanded-coverage', 'mirror-checks', 'disambiguation'],
                uncertaintyTargetAreas: ['secondary-dimension-separation', 'mirror-consistency'],
                routingTags: ['standard', 'expanded', 'internal-eval-1'],
              },
            },
            generationBatch: {
              generationId: 'wf-standard-internal-eval-1',
              sourceType: 'human_seeded',
              modelName: 'gpt-5.3',
              promptVersion: 'disc-standard-authoring-v1',
              context: 'work',
              rationaleNotes:
                'First curated standard-tier content iteration emphasizing balanced DISC axis coverage and disambiguation depth.',
              items: [
                {
                  prompt: 'I push decisions forward when momentum starts to drop.',
                  axis: 'tempo',
                  axisDirection: 'highTempo',
                  weight: 1,
                  reverseKeyed: false,
                  role: 'core',
                  contextApplicability: ['work'],
                  disambiguationTags: ['initiative', 'pace'],
                  uncertaintyProfile: 'distinguish-D-vs-I',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['expanded-coverage'],
                  routingTags: ['standard', 'expanded'],
                  uncertaintyTargetAreas: ['secondary-dimension-separation'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Captures decisive pace without explicit authority language.',
                  aiConfidence: 0.87,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I stay calm and keep a steady rhythm even when others rush.',
                  axis: 'tempo',
                  axisDirection: 'lowTempo',
                  weight: 1,
                  reverseKeyed: false,
                  role: 'core',
                  contextApplicability: ['work'],
                  disambiguationTags: ['steadiness', 'pace-control'],
                  uncertaintyProfile: 'distinguish-S-vs-C',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['expanded-coverage'],
                  routingTags: ['standard', 'expanded'],
                  uncertaintyTargetAreas: ['secondary-dimension-separation'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Targets composed, low-tempo regulation under social pressure.',
                  aiConfidence: 0.85,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I shape plans around measurable quality checkpoints.',
                  axis: 'focus',
                  axisDirection: 'taskFocus',
                  weight: 1,
                  reverseKeyed: false,
                  role: 'core',
                  contextApplicability: ['work'],
                  disambiguationTags: ['quality', 'structure'],
                  uncertaintyProfile: 'distinguish-C-vs-S',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['expanded-coverage'],
                  routingTags: ['standard', 'expanded'],
                  uncertaintyTargetAreas: ['secondary-dimension-separation'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Strengthens task-focus signal with implementation detail orientation.',
                  aiConfidence: 0.86,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I build buy-in early by involving people before final choices are made.',
                  axis: 'focus',
                  axisDirection: 'peopleFocus',
                  weight: 1,
                  reverseKeyed: false,
                  role: 'core',
                  contextApplicability: ['work'],
                  disambiguationTags: ['collaboration', 'influence'],
                  uncertaintyProfile: 'distinguish-I-vs-D',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['expanded-coverage'],
                  routingTags: ['standard', 'expanded'],
                  uncertaintyTargetAreas: ['secondary-dimension-separation'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Captures people-focus via alignment behavior rather than sociability alone.',
                  aiConfidence: 0.88,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I avoid acting until every variable has been fully mapped.',
                  axis: 'tempo',
                  axisDirection: 'highTempo',
                  weight: 1,
                  reverseKeyed: true,
                  role: 'core',
                  contextApplicability: ['work'],
                  disambiguationTags: ['decisiveness', 'hesitation'],
                  uncertaintyProfile: 'distinguish-D-vs-C',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['mirror-checks'],
                  routingTags: ['standard', 'mirror'],
                  uncertaintyTargetAreas: ['mirror-consistency'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Reverse-keyed D signal for response-style balancing.',
                  aiConfidence: 0.8,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I frequently speed up conversations to prevent stalled execution.',
                  axis: 'tempo',
                  axisDirection: 'highTempo',
                  weight: 1,
                  reverseKeyed: false,
                  role: 'mirror',
                  contextApplicability: ['work'],
                  disambiguationTags: ['tempo', 'assertion'],
                  uncertaintyProfile: 'mirror-D-tempo',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['mirror-checks'],
                  routingTags: ['standard', 'mirror'],
                  uncertaintyTargetAreas: ['mirror-consistency'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Mirror-style tempo item for internal consistency checks.',
                  aiConfidence: 0.79,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I slow commitments down when expectations are shifting quickly.',
                  axis: 'tempo',
                  axisDirection: 'lowTempo',
                  weight: 1,
                  reverseKeyed: false,
                  role: 'mirror',
                  contextApplicability: ['work'],
                  disambiguationTags: ['steadiness', 'change-management'],
                  uncertaintyProfile: 'mirror-S-tempo',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['mirror-checks'],
                  routingTags: ['standard', 'mirror'],
                  uncertaintyTargetAreas: ['mirror-consistency'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Mirror counterpart for deliberate pace handling.',
                  aiConfidence: 0.77,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I prefer relational harmony over strict adherence to process details.',
                  axis: 'focus',
                  axisDirection: 'taskFocus',
                  weight: 1,
                  reverseKeyed: true,
                  role: 'mirror',
                  contextApplicability: ['work'],
                  disambiguationTags: ['task-discipline', 'relationship-priority'],
                  uncertaintyProfile: 'mirror-C-focus',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['mirror-checks'],
                  routingTags: ['standard', 'mirror'],
                  uncertaintyTargetAreas: ['mirror-consistency'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Reverse-keyed C mirror to detect socially-driven shifts.',
                  aiConfidence: 0.76,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'I read group mood quickly and adapt my approach to keep others engaged.',
                  axis: 'focus',
                  axisDirection: 'peopleFocus',
                  weight: 1,
                  reverseKeyed: false,
                  role: 'mirror',
                  contextApplicability: ['work'],
                  disambiguationTags: ['social-awareness', 'engagement'],
                  uncertaintyProfile: 'mirror-I-focus',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['mirror-checks'],
                  routingTags: ['standard', 'mirror'],
                  uncertaintyTargetAreas: ['mirror-consistency'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'People-focus mirror item for consistency with influence pattern.',
                  aiConfidence: 0.84,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'When urgency conflicts with precision, I choose speed over refinement.',
                  axis: 'tempo',
                  axisDirection: 'highTempo',
                  weight: 0.75,
                  reverseKeyed: false,
                  role: 'tiebreaker',
                  contextApplicability: ['work'],
                  disambiguationTags: ['tradeoff', 'urgency'],
                  uncertaintyProfile: 'tie-D-vs-C',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['disambiguation'],
                  routingTags: ['standard', 'tiebreaker'],
                  uncertaintyTargetAreas: ['secondary-dimension-separation'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Disambiguates D/C under competing constraints.',
                  aiConfidence: 0.81,
                  aiSuggestedAlternatives: [],
                },
                {
                  prompt: 'In uncertain meetings, I focus first on who needs confidence before deciding details.',
                  axis: 'focus',
                  axisDirection: 'peopleFocus',
                  weight: 0.75,
                  reverseKeyed: false,
                  role: 'tiebreaker',
                  contextApplicability: ['work'],
                  disambiguationTags: ['support', 'influence'],
                  uncertaintyProfile: 'tie-I-vs-S',
                  adaptiveEligible: true,
                  itemPoolGroupIds: ['disambiguation'],
                  routingTags: ['standard', 'tiebreaker'],
                  uncertaintyTargetAreas: ['secondary-dimension-separation'],
                  aiGenerated: true,
                  aiModel: 'gpt-5.3',
                  aiPromptVersion: 'disc-standard-authoring-v1',
                  aiRationale: 'Disambiguates people-centric influence versus steady support.',
                  aiConfidence: 0.78,
                  aiSuggestedAlternatives: [],
                },
              ],
            },
            reviews: [
              { itemIndex: 0, clarityScore: 0.9, ambiguityRisk: 0.15, doubleBarreledRisk: 0.09, socialDesirabilityRisk: 0.23, discriminationPotential: 0.84, mirrorUsefulness: 0.62, overlapRisk: 0.2, status: 'approved', reviewerNotes: 'Strong D tempo core.' },
              { itemIndex: 1, clarityScore: 0.88, ambiguityRisk: 0.16, doubleBarreledRisk: 0.1, socialDesirabilityRisk: 0.2, discriminationPotential: 0.82, mirrorUsefulness: 0.66, overlapRisk: 0.18, status: 'approved', reviewerNotes: 'Strong S tempo core.' },
              { itemIndex: 2, clarityScore: 0.89, ambiguityRisk: 0.17, doubleBarreledRisk: 0.08, socialDesirabilityRisk: 0.19, discriminationPotential: 0.83, mirrorUsefulness: 0.6, overlapRisk: 0.17, status: 'approved', reviewerNotes: 'Strong C task-focus core.' },
              { itemIndex: 3, clarityScore: 0.91, ambiguityRisk: 0.14, doubleBarreledRisk: 0.09, socialDesirabilityRisk: 0.21, discriminationPotential: 0.86, mirrorUsefulness: 0.64, overlapRisk: 0.19, status: 'approved', reviewerNotes: 'Strong I people-focus core.' },
              { itemIndex: 4, clarityScore: 0.79, ambiguityRisk: 0.24, doubleBarreledRisk: 0.13, socialDesirabilityRisk: 0.26, discriminationPotential: 0.69, mirrorUsefulness: 0.71, overlapRisk: 0.36, status: 'rejected', reviewerNotes: 'Too close to existing hesitation wording.' },
              { itemIndex: 5, clarityScore: 0.82, ambiguityRisk: 0.21, doubleBarreledRisk: 0.11, socialDesirabilityRisk: 0.24, discriminationPotential: 0.73, mirrorUsefulness: 0.83, overlapRisk: 0.22, status: 'approved', reviewerNotes: 'Useful D mirror.' },
              { itemIndex: 6, clarityScore: 0.84, ambiguityRisk: 0.2, doubleBarreledRisk: 0.1, socialDesirabilityRisk: 0.2, discriminationPotential: 0.75, mirrorUsefulness: 0.82, overlapRisk: 0.21, status: 'approved', reviewerNotes: 'Useful S mirror.' },
              { itemIndex: 7, clarityScore: 0.76, ambiguityRisk: 0.3, doubleBarreledRisk: 0.14, socialDesirabilityRisk: 0.29, discriminationPotential: 0.61, mirrorUsefulness: 0.72, overlapRisk: 0.39, status: 'rejected', reviewerNotes: 'Ambiguous focus framing; reject.' },
              { itemIndex: 8, clarityScore: 0.86, ambiguityRisk: 0.18, doubleBarreledRisk: 0.1, socialDesirabilityRisk: 0.23, discriminationPotential: 0.78, mirrorUsefulness: 0.81, overlapRisk: 0.2, status: 'approved', reviewerNotes: 'Useful I mirror.' },
              { itemIndex: 9, clarityScore: 0.83, ambiguityRisk: 0.19, doubleBarreledRisk: 0.12, socialDesirabilityRisk: 0.25, discriminationPotential: 0.8, mirrorUsefulness: 0.73, overlapRisk: 0.22, status: 'approved', reviewerNotes: 'Good D/C tiebreaker.' },
              { itemIndex: 10, clarityScore: 0.81, ambiguityRisk: 0.2, doubleBarreledRisk: 0.12, socialDesirabilityRisk: 0.24, discriminationPotential: 0.77, mirrorUsefulness: 0.7, overlapRisk: 0.24, status: 'approved', reviewerNotes: 'Good I/S tiebreaker.' },
            ],
          },
        ),
    );

    console.log('Standard tier internal authoring workflow summary:', workflowResult.internalSummary);
  } else {
    console.log(
      `Standard tier internal authoring workflow skipped (draft already exists: ${existingIterationDraft.assessmentVersionKey}).`,
    );
  }

  console.log('DISC assessment family seeded successfully');
  console.log('Assessment definition id:', assessmentDefinition.id);
  console.log(
    'Assessment versions:',
    assessmentVersions
      .map(
        (version) =>
          `${version.metadata.assessmentVersionKey}=${persistedVersionIdsByKey.get(version.metadata.assessmentVersionKey)}`,
      )
      .join(', '),
  );
  if (createdBootstrapApiKey) {
    console.log('Bootstrap API key (store securely):', createdBootstrapApiKey.plaintextKey);
  } else {
    console.log('Bootstrap API key already exists; seed reused existing key.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
