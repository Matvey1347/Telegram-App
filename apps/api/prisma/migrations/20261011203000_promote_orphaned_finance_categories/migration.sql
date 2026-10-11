-- Categories cannot use an archived or differently typed category as a parent.
-- Preserve the categories themselves by promoting them to root categories.
UPDATE "FinanceCategory" AS child
SET "parentId" = NULL
FROM "FinanceCategory" AS parent
WHERE child."parentId" = parent."id"
  AND (
    parent."archivedAt" IS NOT NULL
    OR parent."type" <> child."type"
  );
