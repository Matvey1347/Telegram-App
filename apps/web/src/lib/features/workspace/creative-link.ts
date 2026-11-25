export const creativeLibraryPath = "/ad-campaigns?section=promo";

export function parseCreativeLinkHash(hash: string) {
  const params = new URLSearchParams(hash.slice(1));
  const id = params.get("creative");
  const workspaceId = params.get("workspace");
  return id && workspaceId ? { id, workspaceId } : null;
}

export function creativeLink(origin: string, workspaceId: string, id: string) {
  const url = new URL(creativeLibraryPath, origin);
  url.hash = new URLSearchParams({
    creative: id,
    workspace: workspaceId,
  }).toString();
  return url.href;
}
