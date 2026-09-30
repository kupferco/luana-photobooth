-- Hand every existing account the new layout.
--
-- Templates are per-tenant rows seeded when an account is created, so an
-- account that already exists has only the layouts that shipped before it.
-- New accounts get both from seedDefaultTemplate; this is the same thing
-- for everyone already here.
--
-- Idempotent on name, so running it twice does nothing the second time --
-- which matters because these numbers are also in
-- packages/shared/src/template.ts and the two must not drift.
INSERT INTO "templates" ("tenant_id", "name", "canvas", "cells", "background_color")
SELECT
  t."id",
  'Banner three-up',
  '{"w": 1800, "h": 1200}'::jsonb,
  '[{"x": 36, "y": 744, "w": 560, "h": 420}, {"x": 620, "y": 744, "w": 560, "h": 420}, {"x": 1204, "y": 744, "w": 560, "h": 420}]'::jsonb,
  '#ffffff'
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "templates" x
  WHERE x."tenant_id" = t."id" AND x."name" = 'Banner three-up'
);
