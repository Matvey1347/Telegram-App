import type { TranslationCatalog } from "@/i18n/types";

const messages = {
  "telegram.posts.title": "Telegram posts",
  "telegram.posts.subtitle":
    "Create drafts, publish now, or schedule directly in Telegram",
  "telegram.posts.tabs.posts": "Posts",
  "telegram.posts.tabs.groups": "Groups",
  "telegram.posts.tabs.editor": "Editor",
  "telegram.posts.tabs.calendar": "Calendar",
  "telegram.posts.channelActions": "Channel actions",
  "telegram.posts.newPost": "New post",
  "telegram.posts.newGroup": "New group",
  "telegram.posts.noChannels": "No Telegram channels with publishing access",
  "telegramPosts.systemGroup.createdInTelegram": "Created in Telegram",
  "telegramPosts.systemGroup.advertise": "Advertise",
  "telegramPosts.systemGroup.systemBotPosts": "System Bot posts",
  "telegramPosts.status.draft": "Draft",
  "telegramPosts.status.publishing": "Publishing",
  "telegramPosts.status.scheduled": "Scheduled",
  "telegramPosts.status.published": "Published",
  "telegramPosts.status.failed": "Failed",
  "telegram.posts.status.synced": "Synced",
  "telegram.posts.remoteStatus.unknown": "Telegram status unknown",
  "telegram.posts.remoteStatus.missing": "Missing in Telegram",
  "telegram.posts.remoteStatus.broken": "Telegram link broken",
  "telegram.posts.search": "Search title, text, group or member",
  "telegram.posts.total": "{count} total",
  "telegram.posts.created": "created {date}",
  "telegram.posts.bulk.waiting": "Waiting for the server…",
  "telegram.posts.bulk.completed":
    "Completed: {success} successful, {failed} failed, {skipped} skipped.",
  "telegram.posts.bulk.published": "Post published.",
  "telegram.posts.bulk.scheduled": "Post scheduled.",
  "telegram.posts.bulk.moved": "Post moved.",
  "telegram.posts.bulk.convertedToDraft": "Post converted to a draft.",
  "telegram.posts.bulk.deleted": "Post deleted.",
  "telegram.posts.bulk.skipped": "Post skipped.",
  "telegram.posts.bulk.failed": "The operation failed for this post.",
  "telegram.posts.count.posts": "Posts: {count}",
  "telegram.posts.error.generic":
    "Could not complete this Telegram posts action.",
  "telegramPosts.errors.channelNotFound":
    "This Telegram channel no longer exists.",
  "telegramPosts.errors.postNotFound": "This post no longer exists.",
  "telegramPosts.errors.groupNotFound": "This post group no longer exists.",
  "telegramPosts.errors.titleRequired": "Internal title is required.",
  "telegramPosts.errors.assignedMemberRequired": "Assign a workspace member.",
  "telegramPosts.errors.contentRequired":
    "Add Telegram text or at least one image.",
  "telegramPosts.errors.invalidSchedule":
    "Enter a valid publication date and time.",
  "telegramPosts.errors.scheduleInPast":
    "Publication time must be in the future.",
  "telegramPosts.errors.invalidTimezone": "The selected timezone is invalid.",
  "telegramPosts.errors.alreadyInTargetChannel":
    "This post is already in the selected channel.",
  "telegramPosts.errors.groupAlreadyInTargetChannel":
    "This group is already in the selected channel.",
  "telegramPosts.errors.publishFailed": "Telegram could not publish this post.",
  "telegramPosts.errors.importRowInvalid":
    "An import row contains invalid data.",
  "telegramPosts.errors.notEditable": "This post cannot be edited.",
  "telegramPosts.errors.notScheduled": "This post is not scheduled.",
  "telegramPosts.errors.batchLimitExceeded":
    "Too many posts were selected for one operation.",
  "telegramPosts.errors.imagesNotEditable":
    "Images cannot be changed after sending or scheduling.",
  "telegramPosts.errors.mediaNotReplaceable":
    "Telegram media cannot be replaced for this post.",
  "telegramPosts.errors.publishSourceUnavailable":
    "Connect an account or bot with posting access to this channel.",
  "telegramPosts.errors.telegramReferenceMissing":
    "The Telegram message reference is missing.",
  "telegramPosts.errors.plannerRangeInvalid":
    "The planner date range is invalid.",
  "telegramPosts.errors.plannerNoAssignments":
    "The planner did not create any assignments.",
  "telegramPosts.errors.plannerFormatNotFound":
    "The planner format no longer exists.",
  "telegramPosts.errors.plannerSlotNotFound":
    "The planner slot no longer exists.",
  "telegramPosts.errors.calendarRangeInvalid":
    "Select a valid calendar date range.",
  "telegramPosts.errors.calendarRangeTooLarge":
    "The selected calendar range is too large.",
  "telegramPosts.errors.manualLinkBlocked":
    "A Telegram link cannot be attached to this post.",
  "telegramPosts.errors.linkInvalid": "Enter a valid Telegram post link.",
  "telegramPosts.errors.linkChannelMismatch":
    "This Telegram link belongs to another channel.",
  "telegramPosts.errors.mediaUrlInvalid": "An image URL is invalid.",
  "telegramPosts.errors.mediaEmpty": "An image is empty.",
  "telegramPosts.errors.mediaTooLarge": "An image is too large.",
  "telegramPosts.errors.mediaInvalid": "Telegram could not process an image.",
  "telegram.posts.support.addPosts": "Add posts",
  "telegram.posts.support.planPreview": "Plan preview",
  "telegram.posts.support.selectedPosts": "Selected posts",
  "telegram.posts.support.availableTimes": "Available times",
  "telegram.posts.support.openTimes": "Open times",
  "telegram.posts.support.openNewTab": "Open post in a new tab",
  "telegram.posts.support.importJsonPlan": "Import JSON plan",
  "telegram.posts.support.plannerDownloaded":
    "GPT planner instruction downloaded.",
  "telegram.posts.support.plannerDownloadError":
    "Could not download GPT planner instruction.",
  "telegram.posts.support.loadingDeletion": "Loading deletion preview",
  "telegram.posts.support.deletionPromptCopied": "Deletion prompt copied.",
  "telegram.posts.support.deletionPromptCopyError":
    "Could not copy deletion prompt.",
  "telegram.posts.support.channelImport": "Channel import",
  "telegram.posts.support.excludeDeletion": "Exclude from deletion",
  "telegram.posts.support.noPostsSelected": "No posts selected.",
  "telegram.posts.support.noGroupsSelected": "No groups selected.",
  "telegram.posts.support.contextDownloaded": "Context downloaded.",
  "telegram.posts.support.context": "Context",
  "telegram.posts.support.downloadingContext": "Downloading context",
  "telegram.posts.support.downloadTxt": "Download selected as TXT",
  "telegram.posts.support.downloadPostsTxt": "Download selected posts as TXT",
  "telegram.posts.support.history": "Post history",
  "telegram.posts.support.historyError": "Could not load history.",
  "telegram.posts.support.synced": "Synced from Telegram",
  "telegram.posts.support.loadingGroups": "Loading post groups",
  "telegram.posts.support.fileReadError": "Could not read this file.",
  "telegram.posts.support.importGroups": "Import groups",
  "telegram.posts.support.promptCopied": "Prompt copied.",
  "telegram.posts.support.returnDrafts": "Return all to drafts",
  "telegram.posts.support.returnDraftsDescription":
    "This permanently deletes every scheduled message currently queued in this Telegram channel. All scheduled posts in Telegram System will become clean drafts and lose their Telegram message IDs and links. Published messages are not affected.",
  "telegram.posts.support.noPostsAvailable": "No posts available to add.",
  "telegram.posts.support.addSelected": "Add selected",
  "telegram.posts.support.planNotScheduled":
    "Nothing is scheduled until you confirm the complete plan.",
  "telegram.posts.support.postsCount": "Posts: {count}",
  "telegram.posts.support.rerollDay": "Reroll day",
  "telegram.posts.support.openNamed": "Open {title} in a new tab",
  "telegram.posts.support.removeNamed": "Remove {title} from plan",
  "telegram.posts.support.noMatchingDrafts":
    "No matching draft posts were found for the available times.",
  "telegram.posts.support.scheduleAll": "Schedule all {count} posts",
  "telegram.posts.support.planUploadHint":
    "Upload or paste postId with scheduledAt, or date and time.",
  "telegram.posts.support.planInstructionHint":
    "The GPT instruction includes stable channel times, post texts, publishing blockers, occupied slots, and recent history.",
  "telegram.posts.support.preparingInstruction": "Preparing instruction…",
  "telegram.posts.support.downloadInstruction": "Download GPT instruction",
  "telegram.posts.support.downloadingContextLabel": "Downloading Context…",
  "telegram.posts.support.historyDescription":
    "Automatic backups are kept for 7 days before risky changes.",
  "telegram.posts.support.loadingHistory": "Loading history…",
  "telegram.posts.support.restore": "Restore",
  "telegram.posts.support.noBackups":
    "No backups yet. A backup is created before publish, schedule, sync changes, restore, delete, and manual edits.",
  "telegram.posts.support.readOnlyDescription":
    "“{title}” is a read-only Telegram post. Its content and engagement update from channel analytics and cannot be edited, scheduled, moved, reordered, or deleted here.",
  "telegram.posts.support.openOriginal": "Open original post in Telegram",
  "telegram.posts.support.returning": "Returning…",
  "telegram.posts.support.resetResult":
    "Deleted {deleted} scheduled Telegram messages and returned {returned} posts to drafts.",
  "telegram.posts.support.resetEmpty":
    "No scheduled Telegram messages or system posts were found.",
  "telegram.posts.support.resetError":
    "Could not return scheduled posts to drafts",
  "telegram.posts.search.label": "Search posts",
  "telegram.posts.search.placeholder": "Search title, text, group or member",
  "telegram.posts.icon.addEmoji": "Add emoji",
  "telegram.posts.icon.addIcon": "Add icon",
  "telegram.posts.time.pickIcon": "Pick icon",
  "telegram.posts.time.title": "Title",
  "telegram.posts.time.optionalLabel": "Optional label",
  "telegram.posts.time.time": "Time",
  "telegram.posts.time.remove": "Remove publishing time",
  "telegram.posts.time.menu": "Time posts",
  "telegram.posts.time.manageTitle": "Publishing times",
  "telegram.posts.time.description":
    "Saved times can be selected when scheduling a post or filling the calendar.",
  "telegram.posts.time.empty":
    "No publishing times yet. Add your first reusable slot.",
  "telegram.posts.time.add": "Add time",
  "telegram.posts.time.addNew": "Add new time",
  "telegram.posts.time.addTitle": "Add publishing time",
  "telegram.posts.time.addAccessible": "Add a new publishing time",
  "telegram.posts.time.save": "Save times",
  "telegram.posts.time.saved": "Publishing times saved.",
  "telegram.posts.time.added": "Publishing time added.",
  "telegram.posts.time.saveError": "Could not save publishing times.",
  "telegram.posts.time.addError": "Could not add publishing time.",
  "telegram.posts.channels.all": "All channels",
  "telegram.posts.channels.selected": "{count} selected",
  "telegram.posts.channels.emptyMeansAll":
    "Empty means visible in every channel",
  "telegram.posts.channels.selectAll": "Select all",
  "telegram.posts.links.repairTitle":
    "Linked posts will be repaired before publication",
  "telegram.posts.links.blockedTitle": "Publishing is blocked by linked posts",
  "telegram.posts.links.readyTitle": "Internal linked posts are ready",
  "telegram.posts.links.repairDescription":
    "You can schedule this series now. Links stay non-clickable until each earlier post is published and verified:",
  "telegram.posts.links.blockedDescription":
    "Publish these posts or attach their Telegram links first:",
  "telegram.posts.links.readyDescription":
    "All linked posts are already ready for publishing.",
  "telegram.posts.links.pending": "Pending verification",
  "telegram.posts.links.blocking": "Blocking",
  "telegram.posts.links.ready": "Ready",
  "telegram.posts.links.broken": "link broken",
  "telegram.posts.links.missingNamed": "Missing post {id}",
  "telegram.posts.links.jumpHint": "Click to jump to this link in the text.",
  "telegram.posts.links.newTabHint": "Cmd/Ctrl-click opens it in a new tab.",
  "telegram.posts.history.beforeEdit": "Before edit",
  "telegram.posts.history.beforePublish": "Before publish",
  "telegram.posts.history.beforeSchedule": "Before schedule",
  "telegram.posts.history.beforeManualLink": "Before manual link",
  "telegram.posts.history.beforeSyncMissing":
    "Before sync: missing in Telegram",
  "telegram.posts.history.beforeSyncBroken":
    "Before sync: broken Telegram post",
  "telegram.posts.history.beforeSyncPublished": "Before sync: published early",
  "telegram.posts.history.beforeSyncUpdate": "Before sync update",
  "telegram.posts.history.beforeRestore": "Before restore",
  "telegram.posts.history.beforeDelete": "Before delete",
  "telegram.posts.history.change": "Change",
  "telegram.posts.history.createdAt": "Backup created {date}",
  "telegram.posts.telegramLink.notFound": "Telegram post was not found",
  "telegram.posts.telegramLink.idMismatch": "Telegram ID mismatch",
  "telegram.posts.telegramLink.notVerified":
    "Telegram ID has not been verified",
  "telegram.posts.telegramLink.verifiedDescription":
    "This link matches the published post found in Telegram.",
  "telegram.posts.telegramLink.mismatchDescription":
    "This Telegram link was set manually and does not match the post found in Telegram. The manual link was preserved.",
  "telegram.posts.telegramLink.missingDescription":
    "Telegram could not find a published message matching this managed post. The saved link was preserved.",
  "telegram.posts.telegramLink.manualDescription":
    "This manual Telegram link has not been verified yet.",
  "telegram.posts.telegramLink.unverifiedDescription":
    "Telegram has not verified a published identity for this post yet.",
  "telegram.posts.telegramLink.scheduledSystem": "Scheduled via Nexeloq",
  "telegram.posts.telegramLink.scheduledTelegram": "Scheduled in Telegram",
  "telegram.posts.telegramLink.systemScheduleDescription":
    "Telegram System will publish this post at the scheduled time. It is not currently in Telegram Scheduled Messages.",
  "telegram.posts.telegramLink.scheduleDescription":
    "Telegram link will be available after publication and verification.",
  "telegram.posts.telegramLink.saved":
    "Telegram post link saved. Verify it against Telegram to confirm the ID.",
  "telegram.posts.telegramLink.removed":
    "Telegram post link removed. Post returned to draft.",
  "telegram.posts.telegramLink.saveError": "Could not save Telegram post link.",
  "telegram.posts.telegramLink.verified": "Telegram post ID verified.",
  "telegram.posts.telegramLink.verifyError":
    "Could not verify the Telegram post ID.",
  "telegram.posts.telegramLink.open": "Open in Telegram",
  "telegram.posts.telegramLink.viewSchedule": "View scheduled Telegram status",
  "telegram.posts.telegramLink.setOrVerify": "Set or verify Telegram link",
  "telegram.posts.telegramLink.deliveryTitle": "Scheduled delivery status",
  "telegram.posts.telegramLink.scheduleTitle": "Scheduled Telegram status",
  "telegram.posts.telegramLink.linkTitle": "Telegram post link",
  "telegram.posts.telegramLink.setTitle": "Set Telegram link",
  "telegram.posts.telegramLink.scheduleError":
    "Telegram could not confirm this scheduled post. A scheduled ID is not a public post link; refresh or reconcile the channel before publication.",
  "telegram.posts.telegramLink.pasteHint":
    "Paste a published Telegram post URL. Manual links are preserved when verification finds a mismatch or cannot find the post.",
  "telegram.posts.telegramLink.saveBeforeCheck":
    "Save this link before checking its Telegram ID.",
  "telegram.posts.telegramLink.checking": "Checking…",
  "telegram.posts.telegramLink.check": "Check Telegram ID",
  "telegram.posts.telegramLink.save": "Save link",
  "telegram.posts.telegramLink.remove": "Remove link",
} as const satisfies TranslationCatalog;

export default messages;
