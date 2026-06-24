-- Add position_entry_date column to strategy_state table
-- This is critical for the re-entry feature: the engine needs to know WHEN
-- the current position was originally placed so it can determine position age
-- (same-day = 0 days, yesterday = 1 day) and decide re-entry eligibility.
-- Without this column, positionEntryDate is lost on every server restart,
-- causing re-entry to always fail with "No entry date recorded".

ALTER TABLE strategy_state 
ADD COLUMN IF NOT EXISTS position_entry_date TEXT DEFAULT NULL;

-- Comment for documentation
COMMENT ON COLUMN strategy_state.position_entry_date IS 
'ISO date (YYYY-MM-DD) when the current position was opened. Used to determine position age for re-entry eligibility check.';
