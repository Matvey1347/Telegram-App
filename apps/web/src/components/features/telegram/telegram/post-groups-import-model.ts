export type PostGroupImportRow = {
  title: string;
  description: string | null;
  icon: string | null;
  createdByMemberId: string | null;
  statusNumberingEnabled: boolean;
  postIds: string[];
};

export function parsePostGroupImportContent(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Import data must be valid JSON.");
  }
  const source = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { groups?: unknown }).groups)
      ? (parsed as { groups: unknown[] }).groups
      : null;
  if (!source?.length) {
    throw new Error(
      'Use a non-empty JSON array or an object with a "groups" array.',
    );
  }
  if (source.length > 50)
    throw new Error("Up to 50 groups can be imported at once.");

  const rows = source.map((value, index): PostGroupImportRow => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Group ${index + 1} must be a JSON object.`);
    }
    const row = value as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) throw new Error(`Group ${index + 1} requires title.`);
    const memberValue = row.createdByMemberId ?? row.memberId ?? row.member;
    const postIds = Array.isArray(row.postIds)
      ? row.postIds.map((postId) => typeof postId === "string" ? postId.trim() : "")
      : [];
    if (postIds.some((postId) => !postId) || new Set(postIds).size !== postIds.length) {
      throw new Error(`Group ${index + 1} postIds must be unique strings.`);
    }
    return {
      title,
      description: optionalString(row.description),
      icon: optionalString(row.icon),
      createdByMemberId: optionalString(memberValue),
      statusNumberingEnabled: row.statusNumberingEnabled === true,
      postIds,
    };
  });
  const duplicateTitle = rows.find(
    (row, index) =>
      rows.findIndex(
        (candidate) =>
          candidate.title.toLocaleLowerCase() === row.title.toLocaleLowerCase(),
      ) !== index,
  );
  if (duplicateTitle) {
    throw new Error(`Duplicate group title in import: ${duplicateTitle.title}`);
  }
  return rows;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function postGroupsGptPrompt(
  members: Array<{ id: string; name: string }>,
) {
  return [
    "Return only a JSON array of Telegram post groups.",
    "Each item must match:",
    '{"title":"Series name","description":"Optional description","icon":"📚 or icon id","memberId":"workspace member id or null","statusNumberingEnabled":false,"postIds":[]}',
    "Available workspace members:",
    ...(members.length
      ? members.map((member) => `- ${member.name}: ${member.id}`)
      : ["- No member list available; use null."]),
    "Do not include markdown fences or commentary.",
  ].join("\n");
}
