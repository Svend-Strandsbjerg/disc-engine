import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const schemaPath = join(process.cwd(), 'packages/infrastructure/prisma/schema.prisma');
const migrationsPath = join(process.cwd(), 'packages/infrastructure/prisma/migrations');

test('AssessmentVersion assessmentVersionKey is represented in both Prisma schema and SQL migrations', () => {
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(
    schema,
    /model\s+AssessmentVersion\s*\{[\s\S]*assessmentVersionKey\s+String[\s\S]*\}/m,
    'AssessmentVersion.assessmentVersionKey must exist in Prisma schema',
  );

  assert.match(
    schema,
    /@@unique\(\[tenantId,\s*assessmentVersionKey\]\)/,
    'AssessmentVersion unique key on tenantId + assessmentVersionKey must exist in Prisma schema',
  );

  assert.equal(existsSync(migrationsPath), true, 'Prisma migrations directory must exist');
  const migrationDirs = readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(
    migrationDirs.length > 0,
    'At least one SQL migration must exist so schema changes are reproducible in production databases',
  );

  const sqlBodies = migrationDirs
    .map((dirName) => join(migrationsPath, dirName, 'migration.sql'))
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => readFileSync(filePath, 'utf8'));

  const hasAssessmentVersionKeyMigration = sqlBodies.some(
    (sql) =>
      sql.includes('"AssessmentVersion"') &&
      sql.includes('assessmentVersionKey') &&
      (sql.includes('ADD COLUMN "assessmentVersionKey"') ||
        sql.includes('RENAME COLUMN "key" TO "assessmentVersionKey"')),
  );

  assert.equal(
    hasAssessmentVersionKeyMigration,
    true,
    'A migration must add or rename AssessmentVersion.assessmentVersionKey to prevent Prisma P2022 drift in deployed databases',
  );
});
