/** Keep popup focus inside its owning app modal and the browser's native top layer. */
export function overlayPortalHost(anchor?: HTMLElement | null): HTMLElement {
  if (anchor) return anchor.closest<HTMLElement>('[data-app-modal="true"]') ?? anchor.closest<HTMLDialogElement>("dialog[open]") ?? document.body;
  // Shared Modal has no trigger anchor. It must not portal into its own content.
  const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return dialogs.item(dialogs.length - 1) ?? document.body;
}
