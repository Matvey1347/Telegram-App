# Channel post reminders

Workspace administrators create a reminder template, select the remaining
coverage thresholds, and apply it to channels. The channel's existing assigned
member receives the alert; each member opts into Telegram and/or web push in
notification settings. Telegram delivery requires an active System Bot
connection. The notification center retains alerts under its existing
90-day policy. Push also requires the member's device subscription and global
web-push setting.

Coverage follows the channel card's content filtering and workspace timezone.
A missing post today is checked separately from the continuous future horizon,
so a post tomorrow does not hide a gap today. Advertising and other excluded
content do not count. Thresholds measure calendar days to the last consecutive
covered day. A missing-today alert runs at 09:00 and 21:00 local time; other
thresholds run at 09:00. Initial configuration is evaluated promptly.

The existing due-driven scheduler owns the indexed next due time and a single
wake timer, with its existing claim, lease, retry and restart recovery. No
eligible assignments means no reminder timer or recurring database query.
Assignment and template changes re-arm it; due work rechecks assignment and
batches booking reads per workspace. Notifications are grouped by member and
stage and split when needed to fit Telegram's message limit. Successful Telegram sends and permanent Telegram rejections are recorded to
avoid retrying the same occurrence indefinitely. Transient failures are retried
without blocking other recipients. The Telegram Bot API
does not offer an idempotency key: a process failure after Telegram accepts a
message but before the success is stored can cause a duplicate.

For one workspace with 100 eligible channels sharing a member and due time,
normal operation has one bounded batch per morning, plus one evening batch for
channels missing today's content. Each batch reads assignment/coverage data in
bulk and updates due times in batches; notifications and Telegram calls scale
with recipients, stages and message-size splits rather than channel count. With
100 separate responsible members there can be up to 100 messages per batch;
the current delivery path also performs several database operations per
recipient (roughly 300–500 or more per batch, depending on enabled transports
and retries). This is a workload estimate, not a measured provider cost.
No per-channel worker, browser polling, additional long-lived connection or
per-channel log history is introduced. The daily queries and due-time writes
can wake Neon; Railway uses the existing scheduler and bot HTTP client, so the
incremental idle CPU and RAM baseline is small. Turning off assignments or
removing eligible members stops this reminder work.
