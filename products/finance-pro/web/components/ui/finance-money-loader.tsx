import type { FinanceVisualContext } from "./finance-visual-context";
import styles from "./finance-money-loader.module.css";

const amounts = ["₴ 24 860,00", "$ 3 240.50", "€ 8 120,00", "₴ 24 860,00"];

export function FinanceMoneyLoader({
  context,
  compact = false,
}: {
  context: FinanceVisualContext;
  compact?: boolean;
}) {
  return (
    <div
      data-finance-money-loader
      data-finance-state="loading"
      data-finance-context={context}
      data-finance-compact={compact ? "true" : "false"}
      className={styles.loader}
      aria-hidden="true"
    >
      <div className={styles.walletCard}>
        <div className={styles.cardTopline}>
          <span className={styles.chip} />
          <span className={styles.maskedNumber}>•• 4821</span>
        </div>
        <div className={styles.balanceLabel}>FINANCE</div>
        <div className={styles.amountWindow} data-finance-amount-reel>
          <div className={styles.amountReel}>
            {amounts.map((amount, index) => (
              <span key={`${amount}-${index}`}>{amount}</span>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.activity}>
        <div className={styles.activityHeader}>
          <span />
          <span />
        </div>
        <MoneyRow tone="expense" amount="− ₴ 420,00" delay="0ms" />
        <MoneyRow tone="income" amount="+ ₴ 3 200,00" delay="140ms" />
        <MoneyRow tone="neutral" amount="− ₴ 86,40" delay="280ms" />
      </div>
    </div>
  );
}

function MoneyRow({
  tone,
  amount,
  delay,
}: {
  tone: "expense" | "income" | "neutral";
  amount: string;
  delay: string;
}) {
  return (
    <div
      className={styles.moneyRow}
      style={{ animationDelay: delay }}
      data-tone={tone}
    >
      <span className={styles.merchantMark} />
      <span className={styles.merchantLines}>
        <span />
        <span />
      </span>
      <strong>{amount}</strong>
    </div>
  );
}
