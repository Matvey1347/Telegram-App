import { formatMoney } from '@/lib/features/finance/money';
import type { CurrencyDisplayMode } from '@/lib/api';

export function NativeMoney({
  amount,
  currency,
  displayMode = 'code',
  className,
}: {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
  displayMode?: CurrencyDisplayMode;
  className?: string;
}) {
  if (amount == null || !Number.isFinite(Number(amount))) return <>-</>;
  return (
    <span className={className}>
      {formatMoney(amount, currency, displayMode)}
    </span>
  );
}
