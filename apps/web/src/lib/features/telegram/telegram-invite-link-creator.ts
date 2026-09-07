type InviteLinkCreator = {
  name?: string | null;
  creatorUsername?: string | null;
  creatorFirstName?: string | null;
  creatorMember?: {
    user?: { name?: string | null } | null;
    name?: string | null;
  } | null;
};

function firstNonBlank(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).find(Boolean);
}

/** Stable label used by invite-link creator avatars when Telegram has no photo. */
export function inviteLinkCreatorFallback(link: InviteLinkCreator) {
  return (
    firstNonBlank([
      link.creatorMember?.user?.name,
      link.creatorMember?.name,
      link.creatorFirstName,
      link.creatorUsername,
    ]) ?? "Admin"
  );
}
