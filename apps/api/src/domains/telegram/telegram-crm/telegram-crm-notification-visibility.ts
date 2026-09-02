export function crmContactNotificationVisibilityKey(contactId: string) {
  return `crm-contact:${contactId}`;
}

export function crmContactIdFromNotificationVisibilityKey(
  value: string | null,
) {
  const prefix = 'crm-contact:';
  return value?.startsWith(prefix) ? value.slice(prefix.length) || null : null;
}
