import type { AuditableEvent, UUID } from '@disc-foundation/shared';

export type AssessmentVersionStatus = 'draft' | 'published';

export interface AssessmentDefinition {
  id: UUID;
  key: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
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
