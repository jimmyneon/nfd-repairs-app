-- Add part_status column to enquiries table
-- Records whether the part for a personalised quote is in stock or needs
-- ordering, so AI Desk quote calls and follow-ups say the right thing
-- (pop in vs. £20 deposit for parts ordering).

ALTER TABLE enquiries
ADD COLUMN IF NOT EXISTS part_status text;
