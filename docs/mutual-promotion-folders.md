# Mutual-promotion folders

Invite links are selected per channel. The create and replacement APIs accept an
invite-link ID, while the server stores `REUSABLE` for new assignments. Existing
`FOLDER_ONLY` rows are treated the same way for availability: a link may be used
in another folder when the folder periods do not overlap. Links reserved by Ads
remain unavailable.

Activation schedules invite-link counter captures at the folder start and end.
The difference is the number of joins attributed to that folder period. Changing
a link in an active folder resets that participant's baseline to the current
counter, so earlier joins remain outside the replacement link's count.

Folders with only paid channels require no posts. They can be activated with
zero publications and schedule only the start and end counter captures. Folders
with publishing channels still require at least five publications.
