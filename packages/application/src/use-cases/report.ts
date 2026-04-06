import { generateReport, type GeneratedReport } from '@disc-engine/domain';
import type {
  AssessmentSessionRepository,
  GeneratedReportRepository,
  ReportTemplateReadRepository,
  ResultRepository,
} from '../ports/repositories.js';
import type { UUID } from '@disc-engine/shared';

export const generateReportForSession = async (
  deps: {
    assessmentSessionRepository: AssessmentSessionRepository;
    resultRepository: ResultRepository;
    reportTemplateReadRepository: ReportTemplateReadRepository;
    generatedReportRepository: GeneratedReportRepository;
  },
  input: { sessionId: UUID; templateId: UUID },
): Promise<GeneratedReport> => {
  const session = await deps.assessmentSessionRepository.getSession(input.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const profileResult = await deps.resultRepository.getResultBySession(input.sessionId);
  if (!profileResult) {
    throw new Error('Session result not found');
  }

  const template = await deps.reportTemplateReadRepository.getTemplateVersion(input.templateId);
  if (!template) {
    throw new Error('Report template not found');
  }

  if (template.status !== 'published') {
    throw new Error('Only published report templates can be used to generate reports');
  }

  if (template.linkedAssessmentVersionId && template.linkedAssessmentVersionId !== session.assessmentVersionId) {
    throw new Error('Report template is not linked to this assessment version');
  }

  const report = generateReport({ profileResult, reportTemplate: template });

  return deps.generatedReportRepository.saveGeneratedReport({
    report,
    lockTemplate: true,
  });
};

export const getGeneratedReportById = async (
  deps: { generatedReportRepository: GeneratedReportRepository },
  reportId: UUID,
): Promise<GeneratedReport | null> => {
  return deps.generatedReportRepository.getGeneratedReportById(reportId);
};
