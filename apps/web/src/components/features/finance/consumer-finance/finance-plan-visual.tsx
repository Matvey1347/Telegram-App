import type { ConsumerFinanceTier } from "@telegram-system/shared";
import styles from "./finance-plan-visual.module.css";

const tierStyle: Record<ConsumerFinanceTier, string> = {
  FREE: styles.free,
  PRO: styles.pro,
  ULTIMATE: styles.ultimate,
};

export function FinancePlanVisual({ tier }: { tier: ConsumerFinanceTier }) {
  return (
    <div
      className={`${styles.scene} ${tierStyle[tier]}`}
      data-finance-plan-visual={tier}
      aria-hidden="true"
    >
      <div className={styles.accountCard}>
        <div className={styles.cardHeader}>
          <span className={styles.chip} />
          <span>
            •• {tier === "FREE" ? "4821" : tier === "PRO" ? "7316" : "9084"}
          </span>
        </div>
        <span className={styles.balanceLabel}>AVAILABLE</span>
        <strong>
          {tier === "FREE"
            ? "₴ 24 860"
            : tier === "PRO"
              ? "₴ 68 420"
              : "₴ 184 300"}
        </strong>
      </div>
      {tier === "FREE" ? <DailyLedger /> : null}
      {tier === "PRO" ? <AutomationReceipt /> : null}
      {tier === "ULTIMATE" ? <InsightStatement /> : null}
    </div>
  );
}

function DailyLedger() {
  return (
    <div className={styles.detailPanel} data-finance-plan-scene="daily-ledger">
      <LedgerRow tone="expense" amount="− ₴ 420" />
      <LedgerRow tone="income" amount="+ ₴ 3 200" />
      <LedgerRow tone="expense" amount="− ₴ 186" />
    </div>
  );
}

function AutomationReceipt() {
  return (
    <div
      className={`${styles.detailPanel} ${styles.automationPanel}`}
      data-finance-plan-scene="automated-ledger"
    >
      <div className={styles.voiceRow}>
        <span className={styles.recordDot} />
        <div className={styles.waveform}>
          {[5, 11, 8, 15, 7, 12, 6].map((height, index) => (
            <span key={`${height}-${index}`} style={{ height }} />
          ))}
        </div>
        <span>00:08</span>
      </div>
      <LedgerRow tone="expense" amount="− ₴ 1 240" />
      <div className={styles.processed}>✓ AUTO</div>
    </div>
  );
}

function InsightStatement() {
  return (
    <div
      className={`${styles.detailPanel} ${styles.insightPanel}`}
      data-finance-plan-scene="finance-statement"
    >
      <div className={styles.statementTop}>
        <span className={styles.statementIcon}>AI</span>
        <span className={styles.statementLines}>
          <span />
          <span />
        </span>
      </div>
      <div className={styles.statementAmount}>
        <span>FORECAST</span>
        <strong>+ ₴ 12 480</strong>
      </div>
      <div className={styles.recommendation}>
        <span />
        <span />
      </div>
    </div>
  );
}

function LedgerRow({
  tone,
  amount,
}: {
  tone: "expense" | "income";
  amount: string;
}) {
  return (
    <div className={styles.ledgerRow} data-tone={tone}>
      <span className={styles.merchant} />
      <span className={styles.rowLines}>
        <span />
        <span />
      </span>
      <strong>{amount}</strong>
    </div>
  );
}
