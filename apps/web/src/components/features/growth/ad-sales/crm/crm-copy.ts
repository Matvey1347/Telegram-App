export const crmCopy = {
  "nav.inbox": "Inbox",
  "nav.contacts": "Clients",
  "nav.deals": "Deals",
  "nav.calendar": "Calendar",
  "nav.analytics": "Analytics",
  "automation.on": "Automated messages · ON",
  "automation.off": "Automated messages · OFF",
  "automation.confirm":
    "Allow future automated Telegram messages for this customer.",
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
