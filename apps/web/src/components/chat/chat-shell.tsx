import type { ReactNode } from "react";
import styles from "./chat.module.css";

/** Layout only: the host owns selection, URL navigation and data. */
export function ChatShell({
  list,
  thread,
  details,
  selected,
}: {
  list: ReactNode;
  thread: ReactNode;
  details?: ReactNode;
  selected: boolean;
}) {
  return (
    <div className={styles.shell} data-chat-selected={selected}>
      <aside className={styles.conversations} aria-label="Conversations">
        {list}
      </aside>
      <section className={styles.threadPane} aria-label="Conversation">
        {thread}
      </section>
      {details}
    </div>
  );
}
