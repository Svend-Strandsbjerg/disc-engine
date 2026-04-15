import type { AuditableEvent, UUID } from '@disc-foundation/shared';

export type AssessmentVersionStatus = 'draft' | 'published';

export interface AssessmentDefinition {
  id: UUID;
  key: string;
  name: string;
  description?: string;
  productLine: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AssessmentTier = 'free' | 'standard' | 'deep';
export type AssessmentForm = 'fixed_form' | 'future_adaptive_ready';

export interface AdaptiveVersionMetadata {
  adaptiveEligible: boolean;
  itemPoolGroupIds: string[];
  uncertaintyTargetAreas: string[];
  routingTags: string[];
}

export interface AssessmentVersionMetadata {
  assessmentVersionKey: string;
  tier: AssessmentTier;
  intendedUse: string;
  contextFrame?: string;
  expectedItemCount: number;
  expectedCompletionTimeMinutes: number;
  form: AssessmentForm;
  adaptive: AdaptiveVersionMetadata;
}

export type QuestionType = 'single_choice' | 'multi_choice' | 'scale' | 'text';

export interface QuestionOption {
  id: UUID;
  questionId: UUID;
  code: string;
  label: string;
  order: number;
  metadata?: Record<string, unknown>;
}

export interface Question {
  id: UUID;
  assessmentVersionId: UUID;
  code: string;
  prompt: string;
  type: QuestionType;
  order: number;
  required: boolean;
  options: QuestionOption[];
  metadata?: Record<string, unknown>;
}

export interface ScoreDimension {
  id: UUID;
  key: string;
  label: string;
  order: number;
}

export interface DimensionImpact {
  dimensionKey: string;
  weight: number;
}

export interface ScoringRule {
  id: UUID;
  assessmentVersionId: UUID;
  questionId: UUID;
  optionId: UUID;
  impacts: DimensionImpact[];
}

export interface AssessmentVersion {
  id: UUID;
  assessmentDefinitionId: UUID;
  versionNumber: number;
  scoringVersion: string;
  metadata: AssessmentVersionMetadata;
  status: AssessmentVersionStatus;
  questionCount: number;
  createdAt: Date;
  publishedAt?: Date;
  immutableAt?: Date;
  dimensions: ScoreDimension[];
  questions: Question[];
  scoringRules: ScoringRule[];
}

export type AssessmentSessionStatus = 'in_progress' | 'completed';

export interface AssessmentSession {
  id: UUID;
  assessmentDefinitionId: UUID;
  assessmentVersionId: UUID;
  status: AssessmentSessionStatus;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface Response {
  id: UUID;
  sessionId: UUID;
  questionId: UUID;
  selectedOptionIds: UUID[];
  value: number | string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoreBreakdownItem {
  dimensionKey: string;
  dimensionLabel: string;
  rawScore: number;
  normalizedScore: number;
  evidence: string[];
}

export type DiscAxis = 'tempo' | 'focus';
export type AxisDirection = 'highTempo' | 'lowTempo' | 'taskFocus' | 'peopleFocus';
export type ItemRole = 'core' | 'mirror' | 'tiebreaker';
export type CandidateItemStatus = 'candidate' | 'needs_revision' | 'approved' | 'rejected';
export type ContextApplicability = 'work' | 'private' | 'generic';

export interface CandidateItemAiMetadata {
  aiGenerated: boolean;
  aiModel?: string;
  aiPromptVersion?: string;
  aiRationale?: string;
  aiConfidence?: number;
  aiSuggestedAlternatives?: string[];
}

export interface CandidateItemDuplicateMatch {
  source: 'candidate_item' | 'promoted_question';
  sourceId: UUID;
  sourcePrompt: string;
  similarityScore: number;
  obviousDuplicate: boolean;
}

export interface CandidateItemIntakeMetadata {
  normalizationVersion: string;
  duplicateScreeningVersion: string;
  likelyDuplicate: boolean;
  obviousDuplicate: boolean;
  duplicateMatches: CandidateItemDuplicateMatch[];
}

export type CandidateItemGenerationSourceType =
  | 'ai_assistant'
  | 'human_seeded'
  | 'bulk_import'
  | 'other';

export interface CandidateItemGenerationBatch {
  id: UUID;
  generationId: string;
  createdAt: Date;
  sourceType: CandidateItemGenerationSourceType;
  modelName: string;
  promptVersion: string;
  targetAssessmentDefinitionId: UUID;
  context?: ContextApplicability;
  rationaleNotes?: string;
  normalizationVersion: string;
}

export interface CandidateItem {
  id: UUID;
  assessmentDefinitionId: UUID;
  prompt: string;
  axis: DiscAxis;
  axisDirection: AxisDirection;
  weight: number;
  reverseKeyed: boolean;
  role: ItemRole;
  mirrorCandidateItemId?: UUID;
  contextApplicability: ContextApplicability[];
  disambiguationTags: string[];
  uncertaintyProfile?: string;
  adaptiveEligible: boolean;
  itemPoolGroupIds: string[];
  routingTags: string[];
  uncertaintyTargetAreas: string[];
  calibration?: {
    informationValue?: number;
    discrimination?: number;
    difficulty?: number;
  };
  aiMetadata: CandidateItemAiMetadata;
  generationBatchId?: UUID;
  intakeMetadata?: CandidateItemIntakeMetadata;
  createdAt: Date;
  updatedAt: Date;
  promotedAt?: Date;
  promotedAssessmentVersionId?: UUID;
  promotedQuestionId?: UUID;
}

export interface CandidateItemReview {
  id: UUID;
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
  nearDuplicateQuestionIds: UUID[];
  createdAt: Date;
}

export interface CandidateItemSimilarityMatch {
  questionId: UUID;
  questionCode: string;
  prompt: string;
  similarityScore: number;
  nearDuplicate: boolean;
}

export interface ItemContribution {
  questionId: UUID;
  questionCode: string;
  responseId: UUID;
  axis: DiscAxis;
  axisDirection: AxisDirection;
  role: ItemRole;
  reverseKeyed: boolean;
  selectedOptionId: UUID;
  selectedOptionCode: string;
  selectedOptionOrder: number;
  selectedIntensity: number;
  alignedValue: number;
  weight: number;
  weightedContribution: number;
  contextApplicability?: string[];
}

export interface MirrorConsistencyCheck {
  mirrorQuestionCode: string;
  mirroredQuestionCode: string;
  mirrorResponseId: UUID;
  mirroredResponseId?: UUID;
  mirrorAlignedValue: number;
  mirroredAlignedValue?: number;
  comparisonScaleMax: number;
  contradictionThreshold: number;
  absoluteDifference?: number;
  contradicted: boolean;
}

export interface ItemResponseDistribution {
  questionId: UUID;
  questionCode: string;
  axisDirection: AxisDirection;
  role: ItemRole;
  responseCount: number;
  optionSelections: Record<string, number>;
}

export interface ItemDiagnostics {
  missingMetadataQuestionIds: UUID[];
  mirrorOrphans: string[];
  zeroWeightQuestionIds: UUID[];
  negativeWeightQuestionIds: UUID[];
}

export interface MeasurementAnalysisSnapshot {
  version: 'disc-v3-item-bank';
  itemContributions: ItemContribution[];
  mirrorConsistency: {
    mirrorPairs: number;
    mirrorContradictions: number;
    contradictionRate: number;
    checks: MirrorConsistencyCheck[];
  };
  responseDistributions: ItemResponseDistribution[];
  diagnostics?: ItemDiagnostics;
}

export interface ProfileResult {
  id: UUID;
  sessionId: UUID;
  assessmentVersionId: UUID;
  scoringVersion: string;
  profileCode: string;
  summary?: string;
  scoreBreakdown: ScoreBreakdownItem[];
  totalScores: Record<string, number>;
  rawResponsesSnapshot: Response[];
  calculatedAt: Date;
  auditTrail: AuditableEvent[];
  measurementAnalysis?: MeasurementAnalysisSnapshot;
}

export interface ReportTemplateDefinition {
  id: UUID;
  key: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ReportTemplateStatus = 'draft' | 'published';

export interface ReportTemplate {
  id: UUID;
  reportTemplateDefinitionId: UUID;
  versionNumber: number;
  templateVersion: string;
  status: ReportTemplateStatus;
  linkedAssessmentVersionId?: UUID;
  createdAt: Date;
  publishedAt?: Date;
  immutableAt?: Date;
  sections: ReportSection[];
  interpretationRules: InterpretationRule[];
}

export interface ReportSection {
  id: UUID;
  templateId: UUID;
  key: string;
  title: string;
  order: number;
}

export type InterpretationTargetType = 'dimension' | 'combination';

export interface InterpretationTarget {
  type: InterpretationTargetType;
  dimensionKeys: string[];
}

export type InterpretationConditionType =
  | 'high'
  | 'medium'
  | 'low'
  | 'top_dimension'
  | 'lowest_dimension';

export interface InterpretationCondition {
  type: InterpretationConditionType;
  minScore?: number;
  maxScore?: number;
}

export interface InterpretationRule {
  id: UUID;
  templateId: UUID;
  sectionKey: string;
  target: InterpretationTarget;
  condition: InterpretationCondition;
  output: string;
  priority: number;
}

export interface GeneratedReportSection {
  key: string;
  title: string;
  order: number;
  content: string[];
}

export interface GeneratedReport {
  id: UUID;
  sessionId: UUID;
  templateId: UUID;
  resultSnapshot: ProfileResult;
  sections: GeneratedReportSection[];
  generatedAt: Date;
}
