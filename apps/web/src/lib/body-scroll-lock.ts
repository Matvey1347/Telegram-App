let activeLocks = 0;
let previousOverflow = "";

/** Every nested overlay releases only its own lock, regardless of unmount order. */
export function acquireBodyScrollLock() {
  if (activeLocks === 0) previousOverflow = document.body.style.overflow;
  activeLocks += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks -= 1;
    if (activeLocks === 0) document.body.style.overflow = previousOverflow;
  };
}
