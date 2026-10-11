-- =====================================================
-- One-off backfill: normalize existing shabad_text rows
-- =====================================================
-- Mirrors the client-side `normalizeShabadText` in app/topics/[id]/page.js:
--   1. Remove every whitespace character inside a line (spaces, tabs, NBSP, …)
--   2. Collapse blank / whitespace-only lines so there's at most one \n between verses
--   3. Trim any leading/trailing whitespace on the full value
--
-- Safe to re-run — the WHERE clause skips rows that are already clean, so a
-- second run will be a no-op.
--
-- Run this in the Supabase SQL editor (service-role / dashboard bypasses RLS).
-- =====================================================

BEGIN;

UPDATE public.shabads
SET shabad_text = btrim(
  regexp_replace(
    regexp_replace(shabad_text, '[^\S\n]+', '', 'g'),  -- step 1: strip in-line whitespace (keeps \n)
    '\n+',                        E'\n', 'g'           -- step 2: collapse runs of newlines (blank lines)
  ),
  E' \t\n\r'                                           -- step 3: trim edges
)
WHERE shabad_text IS NOT NULL
  AND (
    shabad_text ~ '[^\S\n]'          -- has at least one non-newline whitespace char, OR
    OR shabad_text ~ '\n\s*\n'       -- has at least one blank/whitespace-only line, OR
    OR shabad_text ~ '^\s'           -- starts with whitespace, OR
    OR shabad_text ~ '\s$'           -- ends with whitespace
  );

-- Sanity check: this should return 0 after the update above.
-- SELECT count(*) FROM public.shabads
-- WHERE shabad_text ~ '[^\S\n]' OR shabad_text ~ '\n\s*\n' OR shabad_text ~ '^\s' OR shabad_text ~ '\s$';

COMMIT;