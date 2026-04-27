#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_PATH="$ROOT_DIR/packages/infrastructure/prisma/schema.prisma"
SEED_SCRIPT="$ROOT_DIR/packages/infrastructure/prisma/seed.ts"
MIGRATIONS_DIR="$ROOT_DIR/packages/infrastructure/prisma/migrations"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Export the Railway service DATABASE_URL first, then rerun this script."
  exit 1
fi

if [[ -n "${OLD_DATABASE_URL:-}" && "${OLD_DATABASE_URL}" == "${DATABASE_URL}" ]]; then
  echo "ERROR: OLD_DATABASE_URL points to the same value as DATABASE_URL."
  echo "Set OLD_DATABASE_URL to the previous polluted database URL to verify cutover."
  exit 1
fi

if [[ ! -f "$SCHEMA_PATH" ]]; then
  echo "ERROR: Prisma schema not found at $SCHEMA_PATH"
  exit 1
fi

if [[ ! -f "$SEED_SCRIPT" ]]; then
  echo "ERROR: Seed script not found at $SEED_SCRIPT"
  exit 1
fi

cd "$ROOT_DIR"

has_baseline_migration=0
if [[ -d "$MIGRATIONS_DIR" ]]; then
  if rg -q 'CREATE TABLE "ApiKey"' "$MIGRATIONS_DIR"; then
    has_baseline_migration=1
  fi
fi

if [[ "$has_baseline_migration" -eq 1 ]]; then
  echo "==> Running prisma migrate deploy (baseline migrations detected)"
  pnpm prisma migrate deploy --schema "$SCHEMA_PATH"
else
  echo "==> Running prisma db push (baseline migration not found)"
  pnpm prisma db push --schema "$SCHEMA_PATH" --skip-generate
fi

echo "==> Running seed"
pnpm prisma db seed --schema "$SCHEMA_PATH"

echo "==> Verifying required tables and seed rows"
node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { URL } = require('node:url');

const requiredTables = [
  'Tenant',
  'ApiKey',
  'AssessmentVersion',
  'AssessmentDefinition',
  'AssessmentSession',
  'Response',
  'Question',
  'QuestionOption',
  'ScoreDimension',
  'ScoringRule',
  'ProfileResult',
  'CandidateItem',
  'CandidateItemReview',
  'CandidateItemGenerationBatch',
];

const pollutedTables = [
  'User',
  'Company',
  'FamilyEvent',
  'InvestmentEntry',
  'HomePageContent',
  'DiscAssessment',
  'AssessmentInvite',
];

function safeDbLabel(connectionUrl) {
  try {
    const parsed = new URL(connectionUrl);
    return `${parsed.hostname}/${parsed.pathname.replace(/^\//, '') || '(no-db-name)'}`;
  } catch {
    return '(unable to parse db url)';
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`Connected DATABASE_URL target: ${safeDbLabel(process.env.DATABASE_URL || '')}`);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const names = new Set(rows.map((r) => r.tablename));

    const missing = requiredTables.filter((t) => !names.has(t));
    if (missing.length) {
      throw new Error(`Missing required table(s): ${missing.join(', ')}`);
    }

    const pollutedFound = pollutedTables.filter((t) => names.has(t));
    if (pollutedFound.length) {
      throw new Error(
        `Polluted non-engine table(s) found in dedicated DB: ${pollutedFound.join(', ')}`
      );
    }

    const discVersions = await prisma.assessmentVersion.findMany({
      where: {
        assessmentVersionKey: {
          in: ['disc-free-16', 'disc-standard-30', 'disc-deep-80'],
        },
      },
      select: { assessmentVersionKey: true },
    });

    const found = new Set(discVersions.map((v) => v.assessmentVersionKey));
    const missingVersions = ['disc-free-16', 'disc-standard-30', 'disc-deep-80'].filter(
      (k) => !found.has(k),
    );

    if (missingVersions.length) {
      throw new Error(`Missing seeded DISC versions: ${missingVersions.join(', ')}`);
    }

    const bootstrapKeys = await prisma.apiKey.count({
      where: { name: 'Bootstrap API Key', isActive: true },
    });

    if (bootstrapKeys < 1) {
      throw new Error('Bootstrap API key was not found after seed.');
    }

    console.log('All required tables and seed rows are present in the dedicated database.');

    const oldUrl = process.env.OLD_DATABASE_URL;
    if (oldUrl) {
      const oldPrisma = new PrismaClient({
        datasources: { db: { url: oldUrl } },
      });

      try {
        console.log(`Connected OLD_DATABASE_URL target: ${safeDbLabel(oldUrl)}`);
        const oldRows = await oldPrisma.$queryRawUnsafe(
          `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
        );
        const oldNames = new Set(oldRows.map((r) => r.tablename));

        const oldPollutedFound = pollutedTables.filter((t) => oldNames.has(t));
        if (!oldPollutedFound.length) {
          throw new Error(
            'OLD_DATABASE_URL was provided, but expected polluted Strandsbjerg tables were not found.'
          );
        }

        console.log(
          `Old polluted database still contains Strandsbjerg tables (unchanged): ${oldPollutedFound.join(', ')}`
        );
      } finally {
        await oldPrisma.$disconnect();
      }
    } else {
      console.log(
        'OLD_DATABASE_URL not provided; skipped old database verification. Set OLD_DATABASE_URL to verify cutover.'
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
NODE

echo "==> Done"
