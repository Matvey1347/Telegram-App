import styles from "./finance-context-scenes.module.css";

export function AnalyticsScene() {
  const points = [
    [170, 91],
    [238, 72],
    [305, 80],
    [374, 50],
    [447, 60],
  ] as const;
  return (
    <g data-finance-scene="analytics" className={styles.scene}>
      <path d="M164 103H536M164 103V30" className={styles.chartAxis} />
      <path
        d="M170 91L238 72L305 80L374 50L447 60L528 31V103H170Z"
        className={styles.chartArea}
      />
      <path
        d="M170 91L238 72L305 80L374 50L447 60L528 31"
        className={styles.chartLine}
      />
      {points.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="3" className={styles.chartPoint} />
      ))}
      <circle
        data-finance-chart-endpoint
        cx="528"
        cy="31"
        r="5"
        className={styles.chartEndpoint}
      />
      <path
        d="M210 102V94M278 102V88M346 102V91M414 102V78M482 102V70"
        className={styles.chartBars}
      />
    </g>
  );
}

export function DebtsScene() {
  return (
    <g data-finance-scene="debts" className={styles.scene}>
      <BalanceCard x={162} />
      <BalanceCard x={410} delay="120ms" />
      <path
        d="M306 57H394M384 48L394 57L384 66M394 80H306M316 71L306 80L316 89"
        className={styles.exchangeArrows}
      />
    </g>
  );
}

function BalanceCard({ x, delay }: { x: number; delay?: string }) {
  return (
    <g className={styles.balanceCard} style={{ animationDelay: delay }}>
      <rect x={x} y="40" width="128" height="57" rx="14" />
      <rect x={x + 18} y="57" width="56" height="6" rx="3" />
      <rect x={x + 18} y="74" width="88" height="9" rx="4.5" />
    </g>
  );
}

export function RecurringPaymentsScene() {
  return (
    <g data-finance-scene="recurringPayments" className={styles.scene}>
      <g className={styles.calendarCard}>
        <rect x="196" y="28" width="134" height="82" rx="16" />
        <path d="M196 52H330M224 22V39M302 22V39" />
        <rect x="218" y="66" width="22" height="18" rx="5" />
        <rect x="251" y="66" width="22" height="18" rx="5" />
        <rect x="284" y="66" width="22" height="18" rx="5" />
      </g>
      <g className={styles.paymentCard}>
        <rect x="350" y="47" width="140" height="64" rx="15" />
        <rect x="368" y="64" width="76" height="7" rx="3.5" />
        <rect x="368" y="84" width="48" height="9" rx="4.5" />
      </g>
      <path
        d="M346 35C380 17 424 21 449 42M444 29L451 42L437 45"
        className={styles.recurringArrow}
      />
    </g>
  );
}

export function SavingsScene() {
  return (
    <g data-finance-scene="savings" className={styles.scene}>
      <rect
        x="174"
        y="47"
        width="340"
        height="43"
        rx="15"
        className={styles.goalTrack}
      />
      <rect
        x="185"
        y="58"
        width="214"
        height="21"
        rx="10.5"
        className={styles.goalProgress}
      />
      <path d="M448 29V99M448 31H492L480 45H448" className={styles.goalFlag} />
      <g className={styles.savingsCoin}>
        <circle cx="399" cy="68.5" r="15" />
        <path d="M399 60V77M394 63H402C407 63 407 69 402 69H396C391 69 391 75 396 75H404" />
      </g>
    </g>
  );
}

export function InvestmentsScene() {
  return (
    <g data-finance-scene="investments" className={styles.scene}>
      <path d="M167 103H533" className={styles.chartAxis} />
      {[204, 258, 312, 366, 420, 474].map((x, index) => (
        <rect
          key={x}
          x={x}
          y={[81, 69, 75, 52, 59, 35][index]}
          width="22"
          height={[22, 34, 28, 51, 44, 68][index]}
          rx="7"
          className={styles.investmentBar}
          style={{ animationDelay: `${index * 70}ms` }}
        />
      ))}
      <path
        d="M181 84L269 63L335 70L406 45L497 27"
        className={styles.chartLine}
      />
      <circle
        data-finance-chart-endpoint
        cx="497"
        cy="27"
        r="5"
        className={styles.chartEndpoint}
      />
    </g>
  );
}

export function BudgetScene() {
  return (
    <g data-finance-scene="budget" className={styles.scene}>
      {[
        [182, 31],
        [354, 31],
        [182, 76],
        [354, 76],
      ].map(([x, y], index) => (
        <g
          key={`${x}-${y}`}
          className={styles.budgetTile}
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <rect x={x} y={y} width="146" height="34" rx="11" />
          <rect
            x={x + 14}
            y={y + 10}
            width={index % 2 ? 82 : 106}
            height="6"
            rx="3"
          />
          <rect
            x={x + 14}
            y={y + 23}
            width={index === 2 ? 50 : 72}
            height="4"
            rx="2"
          />
        </g>
      ))}
    </g>
  );
}

export function RemindersScene() {
  const notifications = [
    { x: 326, y: 27, width: 130, delay: "90ms" },
    { x: 346, y: 58, width: 164, delay: "180ms" },
    { x: 326, y: 89, width: 118, delay: "270ms" },
  ];
  return (
    <g data-finance-scene="reminders" className={styles.remindersScene}>
      <g className={styles.bell}>
        <path d="M251 82H309L301 72V58C301 43 293 34 280 34C267 34 259 43 259 58V72L251 82Z" />
        <path d="M272 89C274 98 286 98 288 89" />
      </g>
      {notifications.map(({ x, y, width, delay }, index) => (
        <g
          key={y}
          className={styles.notificationCard}
          style={{ animationDelay: delay }}
        >
          <rect x={x} y={y} width={width} height="22" rx="8" />
          <rect
            x={x + 11}
            y={y + 8}
            width={index === 1 ? 74 : 52}
            height="6"
            rx="3"
          />
          <rect x={x + width - 15} y={y + 8} width="6" height="6" rx="3" />
        </g>
      ))}
    </g>
  );
}

export function PlanScene() {
  return (
    <g data-finance-scene="plan" className={styles.scene}>
      <path
        d="M214 28L263 40V67C263 88 246 102 214 111C182 102 165 88 165 67V40L214 28Z"
        className={styles.planShield}
      />
      <path d="M194 68L208 82L236 52" className={styles.planCheck} />
      {[39, 69, 99].map((y, index) => (
        <g
          key={y}
          className={styles.featurePill}
          style={{ animationDelay: `${100 + index * 80}ms` }}
        >
          <rect
            x="302"
            y={y}
            width={index === 1 ? 186 : 154}
            height="20"
            rx="10"
          />
          <circle cx="316" cy={y + 10} r="4" />
          <rect
            x="329"
            y={y + 7.5}
            width={index === 2 ? 70 : 94}
            height="5"
            rx="2.5"
          />
        </g>
      ))}
    </g>
  );
}

export function SettingsScene() {
  return (
    <g data-finance-scene="settings" className={styles.scene}>
      {[35, 65, 95].map((y, index) => (
        <g
          key={y}
          className={styles.settingRow}
          style={{ animationDelay: `${index * 90}ms` }}
        >
          <rect x="184" y={y} width="332" height="20" rx="10" />
          <rect
            x="201"
            y={y + 7.5}
            width={index === 1 ? 112 : 86}
            height="5"
            rx="2.5"
          />
          <rect
            x="458"
            y={y + 4}
            width="42"
            height="12"
            rx="6"
            className={index !== 1 ? styles.toggleOn : undefined}
          />
          <circle cx={index !== 1 ? 493 : 465} cy={y + 10} r="5" />
        </g>
      ))}
    </g>
  );
}
