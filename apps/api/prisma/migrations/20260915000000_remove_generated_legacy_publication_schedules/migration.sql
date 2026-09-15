-- These per-channel schedules were generated only to preserve the retired
-- TelegramChannelTimePost model. Publication schedules are workspace plans
-- created explicitly by users, so generated channel copies do not belong in
-- the schedule library. The old time-post rows remain available as source data.
DELETE FROM "TelegramPublicationSchedule"
WHERE "id" LIKE 'legacy-schedule-%';
