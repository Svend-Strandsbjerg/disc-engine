import type {
  AssessmentDefinition,
  AssessmentSession,
  AssessmentVersion,
  CandidateItem,
  CandidateItemGenerationBatch,
  CandidateItemReview,
  CandidateItemSimilarityMatch,
  CandidateItemStatus,
  ContextApplicability,
  GeneratedReport,
  InterpretationRule,
  ProfileResult,
  ReportSection,
  ReportTemplate,
  ReportTemplateDefinition,
  Question,
  QuestionOption,
  Response,
  ScoreDimension,
  ScoringRule,
} from '@disc-foundation/domain';
import type { UUID } from '@disc-foundation/shared';

export interface AssessmentReadRepository {
  getVersion(versionId: UUID): Promise<AssessmentVersion | null>;
  getActivePublishedVersion(assessmentDefinitionId: UUID): Promise<AssessmentVersion | null>;
}

export interface AssessmentWriteRepository {
  createAssessmentDefinition(input: {
    key: string;
    name: string;
    description?: string;
  }): Promise<AssessmentDefinition>;
  createAssessmentVersionDraft(input: {
    assessmentDefinitionId: UUID;
    scoringVersion: string;
  }): Promise<AssessmentVersion>;
  cloneAssessmentVersion(input: {
    sourceVersionId: UUID;
    scoringVersion: string;
  }): Promise<AssessmentVersion>;
  publishAssessmentVersion(versionId: UUID): Promise<AssessmentVersion>;
  updateDraftVersion(version: AssessmentVersion): Promise<AssessmentVersion>;

  addScoreDimension(input: {
    assessmentVersionId: UUID;
    key: string;
    label: string;
    order: number;
  }): Promise<ScoreDimension>;
  updateScoreDimension(input: {
    id: UUID;
    label?: string;
    order?: number;
  }): Promise<ScoreDimension>;
  removeScoreDimension(id: UUID): Promise<void>;

  addQuestion(input: {
    assessmentVersionId: UUID;
    code: string;
    prompt: string;
    type: Question['type'];
    order: number;
    required: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<Question>;
  updateQuestion(input: {
    id: UUID;
    prompt?: string;
    type?: Question['type'];
    order?: number;
    required?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<Question>;
  removeQuestion(id: UUID): Promise<void>;
  questionHasResponses(questionId: UUID): Promise<boolean>;

  addQuestionOption(input: {
    questionId: UUID;
    code: string;
    label: string;
    order: number;
    metadata?: Record<string, unknown>;
  }): Promise<QuestionOption>;
  updateQuestionOption(input: {
    id: UUID;
    label?: string;
    order?: number;
    metadata?: Record<string, unknown>;
  }): Promise<QuestionOption>;
  removeQuestionOption(id: UUID): Promise<void>;

  addScoringRule(input: {
    assessmentVersionId: UUID;
    questionId: UUID;
    optionId: UUID;
    impacts: ScoringRule['impacts'];
  }): Promise<ScoringRule>;
  updateScoringRule(input: {
    id: UUID;
    impacts?: ScoringRule['impacts'];
    questionId?: UUID;
    optionId?: UUID;
  }): Promise<ScoringRule>;
  removeScoringRule(id: UUID): Promise<void>;
}

export interface CandidateItemRepository {
  createCandidateItem(input: {
    assessmentDefinitionId: UUID;
    prompt: string;
    axis: CandidateItem['axis'];
    axisDirection: CandidateItem['axisDirection'];
    weight: number;
    reverseKeyed: boolean;
    role: CandidateItem['role'];
    mirrorCandidateItemId?: UUID;
    contextApplicability: ContextApplicability[];
    disambiguationTags?: string[];
    uncertaintyProfile?: string;
    aiGenerated: boolean;
    aiModel?: string;
    aiPromptVersion?: string;
    aiRationale?: string;
    aiConfidence?: number;
    aiSuggestedAlternatives?: string[];
    generationBatchId?: UUID;
    intakeMetadata?: Record<string, unknown>;
  }): Promise<CandidateItem>;
  createGenerationBatch(input: {
    generationId: string;
    sourceType: CandidateItemGenerationBatch['sourceType'];
    modelName: string;
    promptVersion: string;
    targetAssessmentDefinitionId: UUID;
    context?: ContextApplicability;
    rationaleNotes?: string;
    normalizationVersion: string;
  }): Promise<CandidateItemGenerationBatch>;
  getDuplicateScreeningCorpus(input: { assessmentDefinitionId: UUID }): Promise<{
    candidateItems: Array<{ id: UUID; prompt: string }>;
    promotedQuestions: Array<{ id: UUID; prompt: string }>;
  }>;
  listCandidateItems(input: {
    assessmentDefinitionId: UUID;
    status?: CandidateItemStatus;
    includePromoted?: boolean;
  }): Promise<Array<CandidateItem & { latestReview?: CandidateItemReview }>>;
  createCandidateItemReview(input: {
    candidateItemId: UUID;
    clarityScore: number;
    ambiguityRisk: number;
    doubleBarreledRisk: number;
    socialDesirabilityRisk: number;
    discriminationPotential: number;
    mirrorUsefulness: number;
    overlapRisk: number;
    reviewerNotes?: string;
    status: CandidateItemStatus;
    nearDuplicateQuestionIds?: UUID[];
  }): Promise<CandidateItemReview>;
  getLatestCandidateItemReview(candidateItemId: UUID): Promise<CandidateItemReview | null>;
  findSimilarItems(input: {
    assessmentDefinitionId: UUID;
    prompt: string;
    threshold?: number;
    limit?: number;
  }): Promise<CandidateItemSimilarityMatch[]>;
  promoteApprovedCandidates(input: {
    assessmentVersionId: UUID;
    candidateItemIds: UUID[];
  }): Promise<
    Array<{
      candidateItemId: UUID;
      questionId: UUID;
      questionCode: string;
    }>
  >;
}

export interface AssessmentSessionRepository {
  createSession(
    input: Pick<AssessmentSession, 'assessmentDefinitionId' | 'assessmentVersionId' | 'metadata'>,
  ): Promise<AssessmentSession>;
  getSession(sessionId: UUID): Promise<AssessmentSession | null>;
  completeSession(sessionId: UUID): Promise<void>;
  getSessionSummary(sessionId: UUID): Promise<{
    id: UUID;
    assessmentDefinitionId: UUID;
    assessmentVersionId: UUID;
    status: AssessmentSession['status'];
    startedAt: Date;
    completedAt?: Date;
    responseCount: number;
    hasResult: boolean;
  } | null>;
}

export interface ResponseRepository {
  upsertResponses(
    sessionId: UUID,
    responses: Omit<Response, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<void>;
  getResponses(sessionId: UUID): Promise<Response[]>;
}

export interface ResultRepository {
  saveResultAndCompleteSession(result: ProfileResult): Promise<void>;
  getResultBySession(sessionId: UUID): Promise<ProfileResult | null>;
}

export interface ReportTemplateReadRepository {
  getTemplateVersion(templateVersionId: UUID): Promise<ReportTemplate | null>;
  getActiveTemplateVersion(reportTemplateDefinitionId: UUID): Promise<ReportTemplate | null>;
}

export interface ReportTemplateWriteRepository {
  createReportTemplateDefinition(input: {
    key: string;
    name: string;
    description?: string;
  }): Promise<ReportTemplateDefinition>;
  createReportTemplateVersionDraft(input: {
    reportTemplateDefinitionId: UUID;
    templateVersion: string;
    linkedAssessmentVersionId?: UUID;
  }): Promise<ReportTemplate>;
  cloneReportTemplateVersion(input: {
    sourceTemplateVersionId: UUID;
    templateVersion: string;
  }): Promise<ReportTemplate>;
  publishReportTemplateVersion(templateVersionId: UUID): Promise<ReportTemplate>;

  addReportSection(input: {
    templateId: UUID;
    key: string;
    title: string;
    order: number;
  }): Promise<ReportSection>;
  updateReportSection(input: {
    id: UUID;
    title?: string;
    order?: number;
  }): Promise<ReportSection>;
  removeReportSection(id: UUID): Promise<void>;

  addInterpretationRule(input: {
    templateId: UUID;
    sectionKey: string;
    target: InterpretationRule['target'];
    condition: InterpretationRule['condition'];
    output: string;
    priority: number;
  }): Promise<InterpretationRule>;
  updateInterpretationRule(input: {
    id: UUID;
    sectionKey?: string;
    target?: InterpretationRule['target'];
    condition?: InterpretationRule['condition'];
    output?: string;
    priority?: number;
  }): Promise<InterpretationRule>;
  removeInterpretationRule(id: UUID): Promise<void>;
}

export interface GeneratedReportRepository {
  saveGeneratedReport(input: {
    report: GeneratedReport;
    lockTemplate: boolean;
  }): Promise<GeneratedReport>;
  getGeneratedReportById(reportId: UUID): Promise<GeneratedReport | null>;
}

export interface ResultReadModel {
  resultId: UUID;
  sessionId: UUID;
  assessmentDefinitionId: UUID;
  assessmentVersionId: UUID;
  scoringVersion: string;
  status: AssessmentSession['status'];
  calculatedAt: Date;
  scoreBreakdown: ProfileResult['scoreBreakdown'];
  totalScores: ProfileResult['totalScores'];
  rawResponsesSnapshot: ProfileResult['rawResponsesSnapshot'];
  auditTrailSummary: {
    eventCount: number;
    eventTypes: string[];
  };
  sessionTimestamps: {
    startedAt: Date;
    completedAt?: Date;
  };
}

export interface SessionDetailReadModel {
  session: {
    id: UUID;
    status: AssessmentSession['status'];
    startedAt: Date;
    completedAt?: Date;
    metadata?: Record<string, unknown>;
  };
  assessment: {
    definitionId: UUID;
    definitionKey: string;
    definitionName: string;
    versionId: UUID;
    versionNumber: number;
    scoringVersion: string;
  };
  responses: Response[];
  hasResult: boolean;
  resultSummary?: {
    resultId: UUID;
    profileCode: string;
    calculatedAt: Date;
  };
}

export interface ResultQueryRepository {
  getResultById(resultId: UUID): Promise<ResultReadModel | null>;
  getResultBySessionId(sessionId: UUID): Promise<ResultReadModel | null>;
  getSessionDetail(sessionId: UUID): Promise<SessionDetailReadModel | null>;
  listResultsByAssessmentDefinition(input: {
    assessmentDefinitionId: UUID;
    from?: Date;
    to?: Date;
    sessionStatus?: AssessmentSession['status'];
    assessmentVersionId?: UUID;
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    items: ResultReadModel[];
    dimensionKeys: string[];
  }>;
  listResultsByAssessmentVersion(input: {
    assessmentVersionId: UUID;
    from?: Date;
    to?: Date;
    sessionStatus?: AssessmentSession['status'];
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    items: ResultReadModel[];
    dimensionKeys: string[];
  }>;
}
