import styles from "./finance-context-scenes.module.css";
import transferStyles from "./finance-transfer-scene.module.css";

export function OverviewScene() {
  return (
    <g data-finance-scene="overview" className={styles.scene}>
      {[162, 286, 410].map((x, index) => (
        <g
          key={x}
          className={styles.summaryCard}
          style={{ animationDelay: `${index * 90}ms` }}
        >
          <rect x={x} y="38" width="106" height="60" rx="14" />
          <rect x={x + 14} y="53" width="36" height="5" rx="2.5" />
          <rect
            x={x + 14}
            y="68"
            width={index === 1 ? 62 : 48}
            height="9"
            rx="4.5"
          />
          <path d={`M${x + 14} 87H${x + 90}`} />
        </g>
      ))}
    </g>
  );
}

export function TransactionsScene() {
  return (
    <g data-finance-scene="transactions" className={styles.scene}>
      {[32, 59, 86].map((y, index) => (
        <g
          key={y}
          className={styles.ledgerRow}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <rect x="168" y={y} width="364" height="19" rx="9.5" />
          <circle cx="182" cy={y + 9.5} r="5" />
          <rect
            x="196"
            y={y + 7}
            width={index === 1 ? 102 : 132}
            height="5"
            rx="2.5"
          />
          <rect x="456" y={y + 7} width="57" height="5" rx="2.5" />
        </g>
      ))}
    </g>
  );
}

export function AccountsScene() {
  return (
    <g data-finance-scene="accounts" className={styles.scene}>
      <g className={styles.backCard}>
        <rect x="218" y="24" width="222" height="76" rx="16" />
      </g>
      <g className={styles.accountCard}>
        <rect x="172" y="37" width="244" height="76" rx="16" />
        <circle cx="202" cy="65" r="12" />
        <rect x="224" y="57" width="92" height="6" rx="3" />
        <rect x="224" y="72" width="58" height="5" rx="2.5" />
        <rect x="328" y="87" width="65" height="9" rx="4.5" />
      </g>
    </g>
  );
}

export function CategoriesScene() {
  return (
    <g data-finance-scene="categories" className={styles.scene}>
      <g className={styles.categoryParent}>
        <rect x="174" y="49" width="112" height="38" rx="12" />
        <circle cx="193" cy="68" r="6" />
        <rect x="207" y="65" width="58" height="6" rx="3" />
      </g>
      <path
        d="M286 68H326M326 43V93M326 43H354M326 93H354"
        className={styles.treeConnector}
      />
      {[31, 81].map((y, index) => (
        <g
          key={y}
          className={styles.categoryChild}
          style={{ animationDelay: `${140 + index * 100}ms` }}
        >
          <rect x="354" y={y} width="154" height="25" rx="9" />
          <circle cx="370" cy={y + 12.5} r="4" />
          <rect
            x="383"
            y={y + 10}
            width={index ? 67 : 82}
            height="5"
            rx="2.5"
          />
        </g>
      ))}
    </g>
  );
}

export function TransfersScene() {
  return (
    <g data-finance-scene="transfers" className={transferStyles.transferScene}>
      <g className={transferStyles.transferAccountLeft}>
        <rect x="58" y="35" width="174" height="66" rx="16" />
        <circle cx="86" cy="60" r="12" />
        <path d="M108 54H198M108 66H171" />
        <rect x="108" y="78" width="58" height="8" rx="4" />
      </g>
      <g className={transferStyles.transferAccountRight}>
        <rect x="368" y="35" width="174" height="66" rx="16" />
        <circle cx="396" cy="60" r="12" />
        <path d="M418 54H508M418 66H481" />
        <rect x="418" y="78" width="58" height="8" rx="4" />
      </g>
      <circle
        cx="300"
        cy="68"
        r="31"
        className={transferStyles.transferOrbit}
      />
      <circle cx="300" cy="68" r="22" className={transferStyles.transferCore} />
      <g className={transferStyles.transferArrows}>
        <path d="M280 59H320M312 51L320 59L312 67" />
        <path d="M320 77H280M288 69L280 77L288 85" />
      </g>
      <path
        d="M239 56C254 38 272 30 294 30C316 30 335 39 361 57"
        className={transferStyles.transferRail}
      />
      <circle cx="246" cy="49" r="5" className={transferStyles.transferToken} />
    </g>
  );
}
