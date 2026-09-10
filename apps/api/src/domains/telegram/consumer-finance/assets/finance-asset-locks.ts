export function financeAccountAllocationLockKey(
  profileId: string,
  accountId: string,
) {
  return `${profileId}:${accountId}`;
}

export function financeTransferSavingsLinkLockKey(
  profileId: string,
  transferId: string,
) {
  return `${profileId}:transfer:${transferId}`;
}
