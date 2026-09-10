import type { ConsumerFinanceTier } from "@telegram-system/shared";
import styles from "./finance-plan-visual.module.css";

const tierTone: Record<ConsumerFinanceTier, string> = {
  FREE: styles.free,
  PRO: styles.pro,
  ULTIMATE: styles.ultimate,
};

export function FinancePlanVisual({ tier }: { tier: ConsumerFinanceTier }) {
  return (
    <div
      className={`${styles.scene} ${tierTone[tier]}`}
      data-finance-plan-visual={tier}
      aria-hidden="true"
    >
      <svg viewBox="0 0 320 154" className={styles.canvas} fill="none">
        <defs>
          <linearGradient id={`finance-${tier}-surface`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="currentColor" stopOpacity=".22" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".025" />
          </linearGradient>
          <linearGradient id={`finance-${tier}-line`} x1="45" y1="118" x2="275" y2="30">
            <stop stopColor="currentColor" stopOpacity=".25" />
            <stop offset=".55" stopColor="currentColor" />
            <stop offset="1" stopColor="#fff" />
          </linearGradient>
          <filter id={`finance-${tier}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path className={styles.grid} d="M24 38H296M24 77H296M24 116H296M76 18V136M160 18V136M244 18V136" />
        <circle className={styles.ambientOne} cx="58" cy="34" r="34" fill="currentColor" />
        <circle className={styles.ambientTwo} cx="267" cy="119" r="42" fill="currentColor" />
        {tier === "FREE" ? <FreeVisual tier={tier} /> : null}
        {tier === "PRO" ? <ProVisual tier={tier} /> : null}
        {tier === "ULTIMATE" ? <UltimateVisual tier={tier} /> : null}
      </svg>
    </div>
  );
}

function FreeVisual({ tier }: { tier: ConsumerFinanceTier }) {
  return (
    <g data-finance-plan-scene="cash-flow">
      <g className={styles.wallet}>
        <rect x="69" y="49" width="151" height="76" rx="18" fill="#090d12" stroke="currentColor" strokeOpacity=".44" strokeWidth="1.5" />
        <path d="M83 49V42c0-8 7-14 15-12l96 19" fill="#111923" stroke="currentColor" strokeOpacity=".25" />
        <path d="M69 76h151" stroke="currentColor" strokeOpacity=".18" />
        <rect x="173" y="69" width="64" height="39" rx="12" fill={`url(#finance-${tier}-surface)`} stroke="currentColor" strokeOpacity=".55" />
        <circle cx="192" cy="88.5" r="5" fill="currentColor" />
        <path d="M89 92h48M89 104h32" stroke="#fff" strokeOpacity=".5" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g className={styles.coinOne} filter={`url(#finance-${tier}-glow)`}>
        <circle cx="242" cy="43" r="12" fill="#090d12" stroke="currentColor" />
        <path d="M242 36v14m4-11h-6a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6h-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className={styles.coinTwo} opacity=".65"><circle cx="56" cy="104" r="8" fill="#090d12" stroke="currentColor" /><path d="M52 104h8" stroke="currentColor" /></g>
      <path className={styles.transferPath} d="M232 57c-7 9-13 14-23 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 7" />
    </g>
  );
}

function ProVisual({ tier }: { tier: ConsumerFinanceTier }) {
  return (
    <g data-finance-plan-scene="live-analytics">
      <rect x="43" y="24" width="234" height="108" rx="20" fill="#080d14" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M63 104h194" stroke="currentColor" strokeOpacity=".18" />
      {[0, 1, 2, 3, 4].map((bar) => <rect key={bar} className={styles.bar} style={{ animationDelay: `${bar * 120}ms` }} x={68 + bar * 36} y={92 - bar * 9} width="15" height={12 + bar * 9} rx="5" fill="currentColor" opacity={0.2 + bar * 0.13} />)}
      <path className={styles.chartLineGlow} d="M65 86c23-6 30 7 48-4 17-10 23-29 43-23 19 6 27 16 45 3 17-12 25-25 55-29" stroke="currentColor" strokeOpacity=".22" strokeWidth="9" strokeLinecap="round" />
      <path className={styles.chartLine} d="M65 86c23-6 30 7 48-4 17-10 23-29 43-23 19 6 27 16 45 3 17-12 25-25 55-29" stroke={`url(#finance-${tier}-line)`} strokeWidth="3" strokeLinecap="round" />
      <g className={styles.signal} filter={`url(#finance-${tier}-glow)`}><circle cx="256" cy="33" r="5" fill="#fff" /><circle cx="256" cy="33" r="11" stroke="currentColor" strokeOpacity=".55" /></g>
      <g className={styles.metricChip}><rect x="56" y="35" width="61" height="24" rx="12" fill={`url(#finance-${tier}-surface)`} stroke="currentColor" strokeOpacity=".28" /><path d="M69 48l6-6 6 5 9-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M96 47h9" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" /></g>
      <rect className={styles.scan} x="48" y="27" width="2" height="102" rx="1" fill="#fff" opacity=".7" />
    </g>
  );
}

function UltimateVisual({ tier }: { tier: ConsumerFinanceTier }) {
  return (
    <g data-finance-plan-scene="protected-intelligence">
      <ellipse className={styles.orbitOuter} cx="160" cy="78" rx="111" ry="48" stroke="currentColor" strokeOpacity=".22" strokeDasharray="3 8" />
      <ellipse className={styles.orbitInner} cx="160" cy="78" rx="80" ry="35" stroke="currentColor" strokeOpacity=".4" strokeDasharray="7 7" />
      <g className={styles.core} filter={`url(#finance-${tier}-glow)`}>
        <path d="M160 30l43 22v31c0 24-17 37-43 46-26-9-43-22-43-46V52l43-22Z" fill={`url(#finance-${tier}-surface)`} stroke="currentColor" strokeWidth="1.5" />
        <path d="M160 45l27 14v21c0 16-10 25-27 32-17-7-27-16-27-32V59l27-14Z" fill="#090b14" stroke="currentColor" strokeOpacity=".55" />
        <path d="m146 79 10 10 21-24" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g className={styles.satelliteOne}><circle cx="271" cy="78" r="6" fill="currentColor" /><circle cx="271" cy="78" r="12" stroke="currentColor" strokeOpacity=".2" /></g>
      <g className={styles.satelliteTwo}><rect x="72" y="42" width="10" height="10" rx="3" fill="#fff" opacity=".8" transform="rotate(45 77 47)" /></g>
      <path className={styles.pulseRing} d="M160 35c33 0 60 19 60 43s-27 43-60 43-60-19-60-43 27-43 60-43Z" stroke="#fff" strokeOpacity=".4" />
    </g>
  );
}
