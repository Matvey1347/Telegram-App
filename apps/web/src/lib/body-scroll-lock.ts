let activeLocks = 0;
let previousOverflow = "";
const listeners = new Set<() => void>();

export function subscribeBodyScrollLock(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function hasBodyScrollLock() {
  return activeLocks > 0;
}

function notifyLockTransition() {
  for (const listener of listeners) listener();
}

/** Every nested overlay releases only its own lock, regardless of unmount order. */
export function acquireBodyScrollLock() {
  const wasUnlocked = activeLocks === 0;
  if (wasUnlocked) previousOverflow = document.body.style.overflow;
  activeLocks += 1;
  document.body.style.overflow = "hidden";
  if (wasUnlocked) notifyLockTransition();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks -= 1;
    if (activeLocks === 0) {
      document.body.style.overflow = previousOverflow;
      notifyLockTransition();
    }
  };
}
