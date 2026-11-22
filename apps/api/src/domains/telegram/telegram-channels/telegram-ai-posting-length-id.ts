export function databasePostingLengthId(channelId: string, localId: string) {
  return `${channelId}::${localId}`;
}

export function localPostingLengthId(channelId: string, databaseId: string) {
  const prefix = `${channelId}::`;
  return databaseId.startsWith(prefix)
    ? databaseId.slice(prefix.length)
    : databaseId;
}
