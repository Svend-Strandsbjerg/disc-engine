import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReport } from './report.js';
import type { ProfileResult, ReportTemplate } from './models.js';

const profileResult: ProfileResult = {
  id: 'result-1',
  sessionId: 'session-1',
  assessmentVersionId: 'version-1',
  scoringVersion: 'score-v1',
  profileCode: 'D',
  scoreBreakdown: [
    { dimensionKey: 'D', dimensionLabel: 'D', rawScore: 9, normalizedScore: 90, evidence: [] },
    { dimensionKey: 'I', dimensionLabel: 'I', rawScore: 5, normalizedScore: 50, evidence: [] },
    { dimensionKey: 'S', dimensionLabel: 'S', rawScore: 2, normalizedScore: 20, evidence: [] },
  ],
  totalScores: { D: 9, I: 5, S: 2 },
  rawResponsesSnapshot: [],
  calculatedAt: new Date('2026-01-01T00:00:00.000Z'),
  auditTrail: [],
};

const template: ReportTemplate = {
  id: 'template-version-1',
  reportTemplateDefinitionId: 'template-def-1',
  versionNumber: 1,
  templateVersion: 'core-v1',
  status: 'published',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  immutableAt: new Date('2026-01-01T00:00:00.000Z'),
  sections: [
    { id: 'section-1', templateId: 'template-version-1', key: 'summary', title: 'Summary', order: 1 },
    { id: 'section-2', templateId: 'template-version-1', key: 'details', title: 'Details', order: 2 },
  ],
  interpretationRules: [
    {
      id: 'rule-1',
      templateId: 'template-version-1',
      sectionKey: 'summary',
      target: { type: 'dimension', dimensionKeys: ['D'] },
      condition: { type: 'top_dimension' },
      output: 'A clear top dimension emerged.',
      priority: 20,
    },
    {
      id: 'rule-2',
      templateId: 'template-version-1',
      sectionKey: 'details',
      target: { type: 'dimension', dimensionKeys: ['S'] },
      condition: { type: 'low' },
      output: 'One dimension is currently lower and may need support.',
      priority: 10,
    },
  ],
};

test('generateReport resolves section content from deterministic rules', () => {
  const report = generateReport({ profileResult, reportTemplate: template });

  assert.equal(report.sessionId, profileResult.sessionId);
  assert.equal(report.sections[0]?.content[0], 'A clear top dimension emerged.');
  assert.equal(report.sections[1]?.content[0], 'One dimension is currently lower and may need support.');
});
