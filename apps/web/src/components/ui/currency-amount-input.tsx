"use client";

import { forwardRef } from "react";
import { Input } from "./primitives";

/** A monetary input whose currency is always visible without consuming form space. */
export const CurrencyAmountInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { currency?: string | null }
>(function CurrencyAmountInput({ currency, className, ...props }, ref) {
  return (
    <div className="relative">
      <Input ref={ref} className={`pr-14 ${className ?? ""}`} {...props} />
      {currency ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
          {currency}
        </span>
      ) : null}
    </div>
  );
});
