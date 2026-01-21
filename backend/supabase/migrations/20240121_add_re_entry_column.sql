-- Add re_entry column to strategy_state table to persist re-entry status
ALTER TABLE strategy_state 
ADD COLUMN IF NOT EXISTS re_entry JSONB DEFAULT '{}'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN strategy_state.re_entry IS 'Stores re-entry eligibility, original strikes, and scheduling info';
