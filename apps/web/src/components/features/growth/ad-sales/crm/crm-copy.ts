export const crmCopy = {
  "nav.inbox": "Inbox",
  "nav.contacts": "Clients",
  "nav.deals": "Deals",
  "nav.calendar": "Calendar",
  "nav.analytics": "Analytics",
  "states.loadingContacts": "Loading contacts…",
  "states.emptyContacts": "No contacts match this view.",
  "states.loadingInbox": "Loading inbox…",
  "states.emptyInbox": "Inbox is clear.",
  "states.loadingConversation": "Loading conversation…",
  "states.emptyConversation": "No messages in this conversation yet.",
} as const;

export type CrmCopyKey = keyof typeof crmCopy;

export function crmText(key: CrmCopyKey) {
  return crmCopy[key];
}
