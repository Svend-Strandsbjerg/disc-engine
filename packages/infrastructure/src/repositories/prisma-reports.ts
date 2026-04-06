import type {
  GeneratedReportRepository,
  ReportTemplateReadRepository,
  ReportTemplateWriteRepository,
} from '@disc-foundation/application';
import type {
  GeneratedReport,
  InterpretationCondition,
  InterpretationRule,
  InterpretationTarget,
  ProfileResult,
  ReportSection,
  ReportTemplate,
  ReportTemplateDefinition,
} from '@disc-foundation/domain';
import type { UUID } from '@disc-foundation/shared';
import { prisma } from '../services/prisma.js';
import { getAccessContext } from '../services/access-context.js';

const templateInclude = {
  sections: { orderBy: { order: 'asc' } },
  interpretationRules: { orderBy: [{ priority: 'desc' }, { id: 'asc' }] },
} as const;

const mapSection = (section: {
  id: string;
  templateId: string;
  key: string;
  title: string;
  order: number;
}): ReportSection => ({
  id: section.id,
  templateId: section.templateId,
  key: section.key,
  title: section.title,
  order: section.order,
});

const mapRule = (rule: {
  id: string;
  templateId: string;
  sectionKey: string;
  target: unknown;
  condition: unknown;
  output: string;
  priority: number;
}): InterpretationRule => ({
  id: rule.id,
  templateId: rule.templateId,
  sectionKey: rule.sectionKey,
  target: rule.target as InterpretationTarget,
  condition: rule.condition as InterpretationCondition,
  output: rule.output,
  priority: rule.priority,
});

const mapTemplate = (row: {
  id: string;
  reportTemplateDefinitionId: string;
  versionNumber: number;
  templateVersion: string;
  status: 'draft' | 'published';
  linkedAssessmentVersionId: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  immutableAt: Date | null;
  sections: Array<{ id: string; templateId: string; key: string; title: string; order: number }>;
  interpretationRules: Array<{
    id: string;
    templateId: string;
    sectionKey: string;
    target: unknown;
    condition: unknown;
    output: string;
    priority: number;
  }>;
}): ReportTemplate => ({
  id: row.id,
  reportTemplateDefinitionId: row.reportTemplateDefinitionId,
  versionNumber: row.versionNumber,
  templateVersion: row.templateVersion,
  status: row.status,
  ...(row.linkedAssessmentVersionId ? { linkedAssessmentVersionId: row.linkedAssessmentVersionId } : {}),
  createdAt: row.createdAt,
  ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
  ...(row.immutableAt ? { immutableAt: row.immutableAt } : {}),
  sections: row.sections.map(mapSection),
  interpretationRules: row.interpretationRules.map(mapRule),
});

const assertDraftTemplate = async (templateId: UUID): Promise<void> => {
  const tenantId = getAccessContext().tenantId;
  const template = await prisma.reportTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!template) throw new Error('Report template version not found');
  if (template.status !== 'draft' || template.immutableAt) throw new Error('Published templates are immutable');
};

export class PrismaReportTemplateRepository
  implements ReportTemplateReadRepository, ReportTemplateWriteRepository
{
  async createReportTemplateDefinition(input: {
    key: string;
    name: string;
    description?: string;
  }): Promise<ReportTemplateDefinition> {
    const tenantId = getAccessContext().tenantId;
    const created = await prisma.reportTemplateDefinition.create({ data: { ...input, tenantId } });
    return {
      id: created.id,
      key: created.key,
      name: created.name,
      ...(created.description ? { description: created.description } : {}),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async createReportTemplateVersionDraft(input: {
    reportTemplateDefinitionId: UUID;
    templateVersion: string;
    linkedAssessmentVersionId?: UUID;
  }): Promise<ReportTemplate> {
    const tenantId = getAccessContext().tenantId;
    const latest = await prisma.reportTemplate.findFirst({
      where: { reportTemplateDefinitionId: input.reportTemplateDefinitionId, tenantId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    const created = await prisma.reportTemplate.create({
      data: {
        tenantId,
        reportTemplateDefinitionId: input.reportTemplateDefinitionId,
        templateVersion: input.templateVersion,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: 'draft',
        linkedAssessmentVersionId: input.linkedAssessmentVersionId,
      },
      include: templateInclude,
    });

    return mapTemplate(created);
  }

  async cloneReportTemplateVersion(input: {
    sourceTemplateVersionId: UUID;
    templateVersion: string;
  }): Promise<ReportTemplate> {
    const tenantId = getAccessContext().tenantId;
    return prisma.$transaction(async (tx) => {
      const source = await tx.reportTemplate.findFirst({
        where: { id: input.sourceTemplateVersionId, tenantId },
        include: templateInclude,
      });
      if (!source) throw new Error('Source report template version not found');

      const latest = await tx.reportTemplate.findFirst({
        where: { reportTemplateDefinitionId: source.reportTemplateDefinitionId, tenantId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });

      const cloned = await tx.reportTemplate.create({
        data: {
          tenantId,
          reportTemplateDefinitionId: source.reportTemplateDefinitionId,
          templateVersion: input.templateVersion,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          status: 'draft',
          linkedAssessmentVersionId: source.linkedAssessmentVersionId,
          sections: {
            createMany: {
              data: source.sections.map((section) => ({
                key: section.key,
                title: section.title,
                order: section.order,
              })),
            },
          },
          interpretationRules: {
            createMany: {
              data: source.interpretationRules.map((rule) => ({
                sectionKey: rule.sectionKey,
                target: rule.target,
                condition: rule.condition,
                output: rule.output,
                priority: rule.priority,
              })),
            },
          },
        },
        include: templateInclude,
      });

      return mapTemplate(cloned);
    });
  }

  async publishReportTemplateVersion(templateVersionId: UUID): Promise<ReportTemplate> {
    const tenantId = getAccessContext().tenantId;
    const current = await prisma.reportTemplate.findFirst({ where: { id: templateVersionId, tenantId } });
    if (!current) throw new Error('Report template version not found');
    if (current.status !== 'draft' || current.immutableAt) throw new Error('Only draft templates can be published');

    const now = new Date();
    const updated = await prisma.reportTemplate.update({
      where: { id: templateVersionId },
      data: { status: 'published', publishedAt: now, immutableAt: now },
      include: templateInclude,
    });

    return mapTemplate(updated);
  }

  async getTemplateVersion(templateVersionId: UUID): Promise<ReportTemplate | null> {
    const tenantId = getAccessContext().tenantId;
    const row = await prisma.reportTemplate.findFirst({
      where: { id: templateVersionId, tenantId },
      include: templateInclude,
    });
    return row ? mapTemplate(row) : null;
  }

  async getActiveTemplateVersion(reportTemplateDefinitionId: UUID): Promise<ReportTemplate | null> {
    const tenantId = getAccessContext().tenantId;
    const row = await prisma.reportTemplate.findFirst({
      where: { reportTemplateDefinitionId, status: 'published', tenantId },
      orderBy: [{ versionNumber: 'desc' }, { publishedAt: 'desc' }],
      include: templateInclude,
    });
    return row ? mapTemplate(row) : null;
  }

  async addReportSection(input: {
    templateId: UUID;
    key: string;
    title: string;
    order: number;
  }): Promise<ReportSection> {
    await assertDraftTemplate(input.templateId);
    return mapSection(await prisma.reportSection.create({ data: input }));
  }

  async updateReportSection(input: { id: UUID; title?: string; order?: number }): Promise<ReportSection> {
    const tenantId = getAccessContext().tenantId;
    const current = await prisma.reportSection.findFirst({
      where: { id: input.id, template: { tenantId } },
    });
    if (!current) throw new Error('Report section not found');

    await assertDraftTemplate(current.templateId);
    return mapSection(
      await prisma.reportSection.update({
        where: { id: input.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.order !== undefined ? { order: input.order } : {}),
        },
      }),
    );
  }

  async removeReportSection(id: UUID): Promise<void> {
    const tenantId = getAccessContext().tenantId;
    const current = await prisma.reportSection.findFirst({ where: { id, template: { tenantId } } });
    if (!current) throw new Error('Report section not found');

    await assertDraftTemplate(current.templateId);
    await prisma.$transaction(async (tx) => {
      await tx.interpretationRule.deleteMany({ where: { templateId: current.templateId, sectionKey: current.key } });
      await tx.reportSection.delete({ where: { id } });
    });
  }

  async addInterpretationRule(input: {
    templateId: UUID;
    sectionKey: string;
    target: InterpretationRule['target'];
    condition: InterpretationRule['condition'];
    output: string;
    priority: number;
  }): Promise<InterpretationRule> {
    await assertDraftTemplate(input.templateId);
    return mapRule(
      await prisma.interpretationRule.create({
        data: {
          templateId: input.templateId,
          sectionKey: input.sectionKey,
          target: input.target,
          condition: input.condition,
          output: input.output,
          priority: input.priority,
        },
      }),
    );
  }

  async updateInterpretationRule(input: {
    id: UUID;
    sectionKey?: string;
    target?: InterpretationRule['target'];
    condition?: InterpretationRule['condition'];
    output?: string;
    priority?: number;
  }): Promise<InterpretationRule> {
    const tenantId = getAccessContext().tenantId;
    const current = await prisma.interpretationRule.findFirst({ where: { id: input.id, template: { tenantId } } });
    if (!current) throw new Error('Interpretation rule not found');

    await assertDraftTemplate(current.templateId);
    return mapRule(
      await prisma.interpretationRule.update({
        where: { id: input.id },
        data: {
          ...(input.sectionKey !== undefined ? { sectionKey: input.sectionKey } : {}),
          ...(input.target !== undefined ? { target: input.target } : {}),
          ...(input.condition !== undefined ? { condition: input.condition } : {}),
          ...(input.output !== undefined ? { output: input.output } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
        },
      }),
    );
  }

  async removeInterpretationRule(id: UUID): Promise<void> {
    const tenantId = getAccessContext().tenantId;
    const current = await prisma.interpretationRule.findFirst({ where: { id, template: { tenantId } } });
    if (!current) throw new Error('Interpretation rule not found');

    await assertDraftTemplate(current.templateId);
    await prisma.interpretationRule.delete({ where: { id } });
  }
}

export class PrismaGeneratedReportRepository implements GeneratedReportRepository {
  async saveGeneratedReport(input: {
    report: GeneratedReport;
    lockTemplate: boolean;
  }): Promise<GeneratedReport> {
    const tenantId = getAccessContext().tenantId;
    return prisma.$transaction(async (tx) => {
      if (input.lockTemplate) {
        const template = await tx.reportTemplate.findFirst({ where: { id: input.report.templateId, tenantId } });
        if (!template) throw new Error('Report template not found');

        if (!template.immutableAt) {
          await tx.reportTemplate.update({ where: { id: input.report.templateId }, data: { immutableAt: input.report.generatedAt } });
        }
      }

      const persisted = await tx.generatedReport.create({
        data: {
          id: input.report.id,
          tenantId,
          sessionId: input.report.sessionId,
          templateId: input.report.templateId,
          profileResultId: input.report.resultSnapshot.id,
          resultSnapshot: input.report.resultSnapshot,
          sections: input.report.sections,
          generatedAt: input.report.generatedAt,
        },
      });

      return {
        id: persisted.id,
        sessionId: persisted.sessionId,
        templateId: persisted.templateId,
        resultSnapshot: persisted.resultSnapshot as ProfileResult,
        sections: persisted.sections as GeneratedReport['sections'],
        generatedAt: persisted.generatedAt,
      };
    });
  }

  async getGeneratedReportById(reportId: UUID): Promise<GeneratedReport | null> {
    const tenantId = getAccessContext().tenantId;
    const row = await prisma.generatedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.sessionId,
      templateId: row.templateId,
      resultSnapshot: row.resultSnapshot as ProfileResult,
      sections: row.sections as GeneratedReport['sections'],
      generatedAt: row.generatedAt,
    };
  }
}
