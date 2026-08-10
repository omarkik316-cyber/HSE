-- Run in Supabase SQL Editor.

-- 1. Sequential, human-friendly ticket number for every observation
--    (e.g. #1, #2, #3...) so it's easy to reference/find on the map.
alter table observations add column if not exists ticket_no serial;

-- 2. New status: an observation goes to "pending_review" when a contractor
--    submits their fix, instead of closing immediately. An admin or safety
--    officer then approves (-> closed) or rejects (-> back to in_progress)
--    the fix.
alter type observation_status add value if not exists 'pending_review';
