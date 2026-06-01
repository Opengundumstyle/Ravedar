-- ============================================================================
-- The original `slug TEXT UNIQUE` constraint on artists assumes one slug per
-- artist name, but the edmtrain feed has multiple distinct artists (different
-- edmtrain_id) sharing the same name — generic stage names like "TBA",
-- collaboration aliases, etc. — which collide on slugify(name).
--
-- The app doesn't reference slug anywhere (grep confirmed), so dropping the
-- uniqueness is safe. The column itself is kept in case it becomes useful
-- for future search/SEO.
-- ============================================================================

ALTER TABLE public.artists DROP CONSTRAINT IF EXISTS artists_slug_key;
