import {
  calculateProfileResult,
  createDefaultScoringEngine,
  type AssessmentVersion,
  type ProfileResult,
  type Response,
  type ScoringEngine,
} from '@disc-foundation/domain';
import type {
  AssessmentReadRepository,
  AssessmentSessionRepository,
  ResponseRepository,
  ResultRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-foundation/shared';
import { deriveSessionLifecycleStatus, type SessionLifecycleStatus } from './session.js';

export interface SessionResultDto {
  sessionId: UUID;
  assessmentVersionId: UUID;
  scoringVersion: string;
  completedAt: Date;
  lifecycleStatus: SessionLifecycleStatus;
  dimensions: {
    D: number;
    I: number;
    S: number;
    C: number;
  };
  normalizedDimensions: {
    D: number;
    I: number;
    S: number;
    C: number;
  };
  scores: {
    raw: {
      D: number;
      I: number;
      S: number;
      C: number;
    };
    normalized: {
      D: number;
      I: number;
      S: number;
      C: number;
    };
  };
  primaryDimension: 'D' | 'I' | 'S' | 'C';
  secondaryDimension: 'D' | 'I' | 'S' | 'C';
  profileSummary: {
    version: string;
    profileCode: string;
    dimensionOrder: Array<'D' | 'I' | 'S' | 'C'>;
    flags: {
      balanced: boolean;
      dominant: boolean;
      topTie: boolean;
    };
  };
  qualityIndicators: {
    version: string;
    score: number;
    flags: {
      flatResponse: boolean;
      extremeResponse: boolean;
      missingDimensionContribution: boolean;
      mirrorInconsistency: boolean;
    };
    metrics: {
      flatResponseRate: number;
      highExtremeRate: number;
      lowExtremeRate: number;
      missingDimensions: Array<'D' | 'I' | 'S' | 'C'>;
      mirrorContradictionRate: number;
      mirrorContradictions: number;
      mirrorPairs: number;
    };
  };
}

export interface SessionScoringDebugDto {
  sessionId: UUID;
  assessmentVersionId: UUID;
  scoringVersion: string;
  version: {
    versionNumber: number;
    status: AssessmentVersion['status'];
  };
  scores: SessionResultDto['scores'];
  primaryDimension: SessionResultDto['primaryDimension'];
  secondaryDimension: SessionResultDto['secondaryDimension'];
  contributions: Array<{
    questionId: UUID;
    questionCode: string;
    prompt: string;
    selectedOptionIds: UUID[];
    selectedOptionCodes: string[];
    impactByDimension: {
      D: number;
      I: number;
      S: number;
      C: number;
    };
  }>;
  diagnostics: {
    normalizationMode: 'max' | 'total_share';
    normalizationDenominator: number;
    topTie: boolean;
  };
  sanityChecks: {
    allDimensionsContributed: boolean;
    dimensionsWithoutContribution: Array<'D' | 'I' | 'S' | 'C'>;
    flatResponsePattern: {
      detected: boolean;
      reason?: string;
    };
    extremeResponsePattern: {
      detected: boolean;
      highExtremeRate: number;
      lowExtremeRate: number;
      threshold: number;
    };
  };
}

export interface CompleteSessionDto {
  sessionId: UUID;
  lifecycleStatus: SessionLifecycleStatus;
  resultAvailable: boolean;
  completedAt: Date;
  result: SessionResultDto;
}

const discDimensions = ['D', 'I', 'S', 'C'] as const;

const normalize = (raw: number, denominator: number): number => {
  if (denominator <= 0) return 0;
  return Number(((raw / denominator) * 100).toFixed(2));
};

const useTotalShareNormalization = (scoringVersion: string): boolean => {
  return scoringVersion === 'disc-v1-likert-16';
};

const clampScore = (value: number): number => Math.max(0, Math.min(100, value));

const rankDimensions = (scores: SessionResultDto['scores']) => {
  return [...discDimensions]
    .map((dimension) => ({
      dimension,
      normalized: scores.normalized[dimension],
      raw: scores.raw[dimension],
    }))
    .sort(
      (a, b) =>
        b.normalized - a.normalized || b.raw - a.raw || a.dimension.localeCompare(b.dimension),
    );
};

const buildProfileSummary = (
  scoringVersion: string,
  ranked: Array<{ dimension: 'D' | 'I' | 'S' | 'C'; normalized: number; raw: number }>,
): SessionResultDto['profileSummary'] => {
  const primary = ranked[0]?.dimension ?? 'D';
  const secondary = ranked[1]?.dimension ?? primary;
  const top = ranked[0]?.normalized ?? 0;
  const second = ranked[1]?.normalized ?? 0;
  const bottom = ranked[ranked.length - 1]?.normalized ?? 0;

  if (scoringVersion === 'disc-v1-likert-16') {
    return {
      version: 'disc-v1-likert-16',
      profileCode: `${primary}${secondary}`,
      dimensionOrder: ranked.map((item) => item.dimension),
      flags: {
        balanced: top - bottom <= 10,
        dominant: top - second >= 15,
        topTie: top === second,
      },
    };
  }

  return {
    version: 'generic-v1',
    profileCode: `${primary}${secondary}`,
    dimensionOrder: ranked.map((item) => item.dimension),
    flags: {
      balanced: false,
      dominant: false,
      topTie: top === second,
    },
  };
};

const extractSelectedOptionOrders = (input: {
  assessmentVersion: AssessmentVersion;
  responses: Response[];
}): number[] => {
  const questionById = new Map(
    input.assessmentVersion.questions.map((question) => [question.id, question] as const),
  );
  return input.responses
    .map((response) => {
      const question = questionById.get(response.questionId);
      const selectedOptionId = response.selectedOptionIds[0];
      const option = question?.options.find((item) => item.id === selectedOptionId);
      return option?.order;
    })
    .filter((order): order is number => typeof order === 'number');
};

const buildQualityIndicators = (input: {
  result: ProfileResult;
  scoringVersion: string;
  rawScores: SessionResultDto['scores']['raw'];
  assessmentVersion?: AssessmentVersion;
  responses?: Response[];
}): SessionResultDto['qualityIndicators'] => {
  const missingDimensions = discDimensions.filter((dimension) => input.rawScores[dimension] <= 0);
  const mirrorConsistencyEvent = input.result.auditTrail.find(
    (event) => event.type === 'mirror_consistency_evaluated',
  );
  const mirrorConsistencyPayload =
    mirrorConsistencyEvent &&
    typeof mirrorConsistencyEvent.payload === 'object' &&
    mirrorConsistencyEvent.payload
      ? (mirrorConsistencyEvent.payload as {
          mirrorPairs?: number;
          mirrorContradictions?: number;
          contradictionRate?: number;
        })
      : undefined;
  const mirrorPairs = mirrorConsistencyPayload?.mirrorPairs ?? 0;
  const mirrorContradictions = mirrorConsistencyPayload?.mirrorContradictions ?? 0;
  const mirrorContradictionRate = mirrorConsistencyPayload?.contradictionRate ?? 0;
  const mirrorInconsistency = mirrorContradictions > 0;

  if (
    input.scoringVersion !== 'disc-v1-likert-16' ||
    input.assessmentVersion === undefined ||
    input.responses === undefined
  ) {
    return {
      version: 'generic-v1',
      score: missingDimensions.length === 0 ? 100 : 80,
      flags: {
        flatResponse: false,
        extremeResponse: false,
        missingDimensionContribution: missingDimensions.length > 0,
        mirrorInconsistency,
      },
      metrics: {
        flatResponseRate: 0,
        highExtremeRate: 0,
        lowExtremeRate: 0,
        missingDimensions,
        mirrorContradictionRate,
        mirrorContradictions,
        mirrorPairs,
      },
    };
  }

  const selectedOptionOrders = extractSelectedOptionOrders({
    assessmentVersion: input.assessmentVersion,
    responses: input.responses,
  });

  const responseCount = selectedOptionOrders.length;
  const optionCount = Math.max(
    ...input.assessmentVersion.questions.map((question) => question.options.length),
    0,
  );
  const lowOrder = optionCount > 0 ? 1 : 0;
  const highOrder = optionCount;

  const highExtremeRate =
    responseCount > 0
      ? Number(
          (
            selectedOptionOrders.filter((order) => order === highOrder).length / responseCount
          ).toFixed(2),
        )
      : 0;
  const lowExtremeRate =
    responseCount > 0
      ? Number(
          (
            selectedOptionOrders.filter((order) => order === lowOrder).length / responseCount
          ).toFixed(2),
        )
      : 0;

  const countsByOrder = new Map<number, number>();
  selectedOptionOrders.forEach((order) => {
    countsByOrder.set(order, (countsByOrder.get(order) ?? 0) + 1);
  });
  const maxFrequency = responseCount > 0 ? Math.max(...countsByOrder.values()) : 0;
  const flatResponseRate =
    responseCount > 0 ? Number((maxFrequency / responseCount).toFixed(2)) : 0;

  const flatResponse = flatResponseRate >= 0.8;
  const extremeResponse = highExtremeRate >= 0.8 || lowExtremeRate >= 0.8;
  const missingDimensionContribution = missingDimensions.length > 0;

  return {
    version: 'disc-v1-likert-16',
    score: clampScore(
      100 -
        (flatResponse ? 40 : 0) -
        (extremeResponse ? 40 : 0) -
        (missingDimensionContribution ? 20 : 0) -
        (mirrorInconsistency ? 20 : 0),
    ),
    flags: {
      flatResponse,
      extremeResponse,
      missingDimensionContribution,
      mirrorInconsistency,
    },
    metrics: {
      flatResponseRate,
      highExtremeRate,
      lowExtremeRate,
      missingDimensions,
      mirrorContradictionRate,
      mirrorContradictions,
      mirrorPairs,
    },
  };
};

const toDiscScores = (input: {
  result: ProfileResult;
  assessmentVersion: AssessmentVersion;
}): Pick<
  SessionResultDto,
  | 'dimensions'
  | 'normalizedDimensions'
  | 'scores'
  | 'primaryDimension'
  | 'secondaryDimension'
  | 'profileSummary'
  | 'qualityIndicators'
> => {
  const { result, assessmentVersion } = input;
  const byDimension = new Map(
    result.scoreBreakdown.map((item) => [item.dimensionKey.toUpperCase(), item] as const),
  );

  const raw = {
    D: byDimension.get('D')?.rawScore ?? 0,
    I: byDimension.get('I')?.rawScore ?? 0,
    S: byDimension.get('S')?.rawScore ?? 0,
    C: byDimension.get('C')?.rawScore ?? 0,
  };

  const normalized = {
    D: byDimension.get('D')?.normalizedScore ?? 0,
    I: byDimension.get('I')?.normalizedScore ?? 0,
    S: byDimension.get('S')?.normalizedScore ?? 0,
    C: byDimension.get('C')?.normalizedScore ?? 0,
  };

  const scores = { raw, normalized };
  const ranked = rankDimensions(scores);

  return {
    dimensions: raw,
    normalizedDimensions: normalized,
    scores,
    primaryDimension: ranked[0]?.dimension ?? 'D',
    secondaryDimension: ranked[1]?.dimension ?? ranked[0]?.dimension ?? 'I',
    profileSummary: buildProfileSummary(result.scoringVersion, ranked),
    qualityIndicators: buildQualityIndicators({
      result,
      scoringVersion: result.scoringVersion,
      rawScores: raw,
      assessmentVersion,
      responses: result.rawResponsesSnapshot,
    }),
  };
};

const buildDebugModel = (input: {
  sessionId: UUID;
  assessmentVersion: AssessmentVersion;
  responses: Response[];
}): SessionScoringDebugDto => {
  const { assessmentVersion, responses, sessionId } = input;

  const questionById = new Map(
    assessmentVersion.questions.map((question) => [question.id, question] as const),
  );
  const ruleByQuestionOption = new Map(
    assessmentVersion.scoringRules.map(
      (rule) => [`${rule.questionId}:${rule.optionId}`, rule] as const,
    ),
  );

  const rawByDimension: SessionResultDto['scores']['raw'] = { D: 0, I: 0, S: 0, C: 0 };

  const contributions = responses.map((response) => {
    const question = questionById.get(response.questionId);
    const impactByDimension: SessionScoringDebugDto['contributions'][number]['impactByDimension'] =
      {
        D: 0,
        I: 0,
        S: 0,
        C: 0,
      };

    const selectedOptionCodes: string[] = [];

    response.selectedOptionIds.forEach((optionId) => {
      const option = question?.options.find((item) => item.id === optionId);
      if (option) {
        selectedOptionCodes.push(option.code);
      }

      const rule = ruleByQuestionOption.get(`${response.questionId}:${optionId}`);
      if (!rule) {
        return;
      }

      rule.impacts.forEach((impact) => {
        const key = impact.dimensionKey.toUpperCase() as keyof typeof impactByDimension;
        if (!(key in impactByDimension)) {
          return;
        }
        impactByDimension[key] += impact.weight;
        rawByDimension[key] += impact.weight;
      });
    });

    return {
      questionId: response.questionId,
      questionCode: question?.code ?? 'unknown',
      prompt: question?.prompt ?? 'Unknown question',
      selectedOptionIds: response.selectedOptionIds,
      selectedOptionCodes,
      impactByDimension,
    };
  });

  const maxRaw = Math.max(...Object.values(rawByDimension), 0);
  const totalRaw = Object.values(rawByDimension).reduce((sum, value) => sum + value, 0);
  const normalizationMode = useTotalShareNormalization(assessmentVersion.scoringVersion)
    ? 'total_share'
    : 'max';
  const normalizationDenominator = normalizationMode === 'total_share' ? totalRaw : maxRaw;

  const normalized: SessionResultDto['scores']['normalized'] = {
    D: normalize(rawByDimension.D, normalizationDenominator),
    I: normalize(rawByDimension.I, normalizationDenominator),
    S: normalize(rawByDimension.S, normalizationDenominator),
    C: normalize(rawByDimension.C, normalizationDenominator),
  };

  const ranked = [...discDimensions]
    .map((dimension) => ({
      dimension,
      score: normalized[dimension],
      raw: rawByDimension[dimension],
    }))
    .sort((a, b) => b.score - a.score || b.raw - a.raw || a.dimension.localeCompare(b.dimension));

  const qualityIndicators = buildQualityIndicators({
    result: calculateProfileResult({ assessmentVersion, responses }),
    scoringVersion: assessmentVersion.scoringVersion,
    rawScores: rawByDimension,
    assessmentVersion,
    responses,
  });
  const selectedOptionOrders = extractSelectedOptionOrders({
    assessmentVersion,
    responses,
  });
  const allSameOrder =
    selectedOptionOrders.length > 0 &&
    selectedOptionOrders.every((order) => order === selectedOptionOrders[0]);

  return {
    sessionId,
    assessmentVersionId: assessmentVersion.id,
    scoringVersion: assessmentVersion.scoringVersion,
    version: {
      versionNumber: assessmentVersion.versionNumber,
      status: assessmentVersion.status,
    },
    scores: {
      raw: rawByDimension,
      normalized,
    },
    primaryDimension: ranked[0]?.dimension ?? 'D',
    secondaryDimension: ranked[1]?.dimension ?? ranked[0]?.dimension ?? 'I',
    contributions,
    diagnostics: {
      normalizationMode,
      normalizationDenominator,
      topTie: ranked.length > 1 ? (ranked[0]?.score ?? 0) === (ranked[1]?.score ?? 0) : false,
    },
    sanityChecks: {
      allDimensionsContributed: qualityIndicators.metrics.missingDimensions.length === 0,
      dimensionsWithoutContribution: qualityIndicators.metrics.missingDimensions,
      flatResponsePattern: {
        detected: qualityIndicators.flags.flatResponse || allSameOrder,
        ...(allSameOrder
          ? { reason: `All responses were submitted at option order ${selectedOptionOrders[0]}.` }
          : {}),
      },
      extremeResponsePattern: {
        detected: qualityIndicators.flags.extremeResponse,
        highExtremeRate: qualityIndicators.metrics.highExtremeRate,
        lowExtremeRate: qualityIndicators.metrics.lowExtremeRate,
        threshold: 0.8,
      },
    },
  };
};

export const calculateResult = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
    responseRepository: ResponseRepository;
    resultRepository: ResultRepository;
    scoringEngine?: ScoringEngine;
  },
  sessionId: UUID,
): Promise<ProfileResult> => {
  const session = await deps.assessmentSessionRepository.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'in_progress') {
    throw new Error('Session is already completed');
  }

  const version = await deps.assessmentReadRepository.getVersion(session.assessmentVersionId);
  if (!version) {
    throw new Error('Assessment version not found');
  }

  const responses = await deps.responseRepository.getResponses(sessionId);

  const engine = deps.scoringEngine ?? createDefaultScoringEngine();
  const result = engine.calculate({ assessmentVersion: version, responses });

  await deps.resultRepository.saveResultAndCompleteSession(result);
  return result;
};

export const getSessionResult = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
    resultRepository: ResultRepository;
  },
  sessionId: UUID,
): Promise<SessionResultDto | null> => {
  const session = await deps.assessmentSessionRepository.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const result = await deps.resultRepository.getResultBySession(sessionId);
  if (!result) {
    return null;
  }

  const assessmentVersion = await deps.assessmentReadRepository.getVersion(
    session.assessmentVersionId,
  );
  if (!assessmentVersion) {
    throw new Error('Assessment version not found');
  }

  const discScores = toDiscScores({ result, assessmentVersion });

  return {
    sessionId: result.sessionId,
    assessmentVersionId: session.assessmentVersionId,
    scoringVersion: result.scoringVersion,
    completedAt: result.calculatedAt,
    lifecycleStatus: deriveSessionLifecycleStatus({
      status: session.status,
      responseCount: result.rawResponsesSnapshot.length,
      hasResult: true,
    }),
    ...discScores,
  };
};

export const completeSession = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
    responseRepository: ResponseRepository;
    resultRepository: ResultRepository;
    scoringEngine?: ScoringEngine;
  },
  sessionId: UUID,
): Promise<CompleteSessionDto> => {
  const session = await deps.assessmentSessionRepository.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const existing = await getSessionResult(
    {
      assessmentReadRepository: deps.assessmentReadRepository,
      assessmentSessionRepository: deps.assessmentSessionRepository,
      resultRepository: deps.resultRepository,
    },
    sessionId,
  );

  if (existing) {
    return {
      sessionId,
      lifecycleStatus: existing.lifecycleStatus,
      resultAvailable: true,
      completedAt: existing.completedAt,
      result: existing,
    };
  }

  if (session.status !== 'in_progress') {
    throw new Error('Completed session result is unavailable');
  }

  await calculateResult(deps, sessionId);

  const finalized = await getSessionResult(
    {
      assessmentReadRepository: deps.assessmentReadRepository,
      assessmentSessionRepository: deps.assessmentSessionRepository,
      resultRepository: deps.resultRepository,
    },
    sessionId,
  );

  if (!finalized) {
    throw new Error('Session result unavailable after completion');
  }

  return {
    sessionId,
    lifecycleStatus: finalized.lifecycleStatus,
    resultAvailable: true,
    completedAt: finalized.completedAt,
    result: finalized,
  };
};

export const getSessionScoringDebug = async (
  deps: {
    assessmentReadRepository: AssessmentReadRepository;
    assessmentSessionRepository: AssessmentSessionRepository;
    responseRepository: ResponseRepository;
  },
  sessionId: UUID,
): Promise<SessionScoringDebugDto> => {
  const session = await deps.assessmentSessionRepository.getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const assessmentVersion = await deps.assessmentReadRepository.getVersion(
    session.assessmentVersionId,
  );
  if (!assessmentVersion) {
    throw new Error('Assessment version not found');
  }

  const responses = await deps.responseRepository.getResponses(sessionId);

  return buildDebugModel({
    sessionId,
    assessmentVersion,
    responses,
  });
};
