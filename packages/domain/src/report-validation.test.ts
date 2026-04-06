import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReportTemplateForPublish } from './report-validation.js';
import type { ReportTemplate } from './models.js';

const baseTemplate: ReportTemplate = {
  id: 'tpl-v1',
  reportTemplateDefinitionId: 'tpl-def-1',
  versionNumber: 1,
  templateVersion: 'v1',
  status: 'draft',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sections: [{ id: 'sec-1', templateId: 'tpl-v1', key: 'summary', title: 'Summary', order: 1 }],
  interpretationRules: [
    {
      id: 'rule-1',
      templateId: 'tpl-v1',
      sectionKey: 'summary',
      target: { type: 'dimension', dimensionKeys: ['D'] },
      condition: { type: 'high' },
      output: 'High score narrative.',
      priority: 100,
    },
  ],
};

test('validateReportTemplateForPublish allows valid templates', () => {
  const validation = validateReportTemplateForPublish(baseTemplate);
  assert.equal(validation.isPublishable, true);
  assert.equal(validation.errors.length, 0);
});

test('validateReportTemplateForPublish blocks templates with no sections or rules', () => {
  const validation = validateReportTemplateForPublish({
    ...baseTemplate,
    sections: [],
    interpretationRules: [],
  });

  assert.equal(validation.isPublishable, false);
  assert.ok(validation.errors.some((entry) => entry.code === 'NO_SECTIONS'));
  assert.ok(validation.errors.some((entry) => entry.code === 'NO_RULES'));
});
