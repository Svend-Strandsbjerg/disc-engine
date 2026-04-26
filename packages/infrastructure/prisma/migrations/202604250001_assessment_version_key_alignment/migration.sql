-- Align legacy AssessmentVersion schema to Prisma model expectations.
-- This migration handles both historical shapes:
--   1) legacy "key" column (renamed in-place)
--   2) missing key column entirely (added + backfilled)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssessmentVersion'
      AND column_name = 'key'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssessmentVersion'
      AND column_name = 'assessmentVersionKey'
  ) THEN
    EXECUTE 'ALTER TABLE "AssessmentVersion" RENAME COLUMN "key" TO "assessmentVersionKey"';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssessmentVersion'
      AND column_name = 'assessmentVersionKey'
  ) THEN
    EXECUTE 'ALTER TABLE "AssessmentVersion" ADD COLUMN "assessmentVersionKey" TEXT';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssessmentVersion'
      AND column_name = 'adaptiveMetadata'
  ) THEN
    EXECUTE $SQL$
      UPDATE "AssessmentVersion"
      SET "assessmentVersionKey" = COALESCE(
        NULLIF("assessmentVersionKey", ''),
        NULLIF("adaptiveMetadata"->>'assessmentVersionKey', ''),
        CONCAT('assessment-version-', "id")
      )
      WHERE "assessmentVersionKey" IS NULL OR "assessmentVersionKey" = ''
    $SQL$;
  ELSE
    EXECUTE $SQL$
      UPDATE "AssessmentVersion"
      SET "assessmentVersionKey" = COALESCE(
        NULLIF("assessmentVersionKey", ''),
        CONCAT('assessment-version-', "id")
      )
      WHERE "assessmentVersionKey" IS NULL OR "assessmentVersionKey" = ''
    $SQL$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AssessmentVersion'
      AND column_name = 'assessmentVersionKey'
  ) THEN
    EXECUTE 'ALTER TABLE "AssessmentVersion" ALTER COLUMN "assessmentVersionKey" SET NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AssessmentVersion_tenantId_key_key'
      AND conrelid = '"AssessmentVersion"'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE "AssessmentVersion" DROP CONSTRAINT "AssessmentVersion_tenantId_key_key"';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AssessmentVersion_tenantId_assessmentVersionKey_key'
      AND conrelid = '"AssessmentVersion"'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE "AssessmentVersion" ADD CONSTRAINT "AssessmentVersion_tenantId_assessmentVersionKey_key" UNIQUE ("tenantId", "assessmentVersionKey")';
  END IF;
END $$;
