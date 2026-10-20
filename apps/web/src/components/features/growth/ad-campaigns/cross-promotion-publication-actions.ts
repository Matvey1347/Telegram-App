export function canUpdatePublicationInTelegram(params: {
  changed: boolean;
  published: boolean;
}) {
  return params.changed || params.published;
}
