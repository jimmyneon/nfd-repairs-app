-- ============================================================================
-- Enquiry drop-off preference columns
-- ============================================================================
-- The customer quote journey lets people say when they're hoping to bring
-- their device in ("Today" / a named day / "I need an alternative time").
-- These columns store that preference plus the staff decision, so the
-- enquiries page can show "wants to bring it in: Monday 28 September" and
-- offer Confirm / Suggest different day actions.
--
-- Safe to run more than once. If this has NOT been run yet, the app still
-- works — submissions fall back to embedding the preference in
-- issue_description, and the enquiries page parses it from there.
-- ============================================================================

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS dropoff_preference TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_date DATE,
  ADD COLUMN IF NOT EXISTS dropoff_note TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_status TEXT;

-- dropoff_status values used by the app:
--   NULL                    — customer stated a preference, staff haven't
--                             confirmed or redirected it yet
--   'confirmed'             — staff tapped "Confirm day" and the customer
--                             was told that day works
--   'alternative_suggested' — staff tapped "Suggest different day" and the
--                             customer was told to come during opening hours
COMMENT ON COLUMN public.enquiries.dropoff_status IS
  'NULL = awaiting staff decision; confirmed; alternative_suggested';
