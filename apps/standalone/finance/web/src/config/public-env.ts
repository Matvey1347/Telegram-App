/** Public configuration for the standalone Finance host only. */
export const publicFinanceWebEnvironment = {
  apiUrl: process.env.NEXT_PUBLIC_FINANCE_API_URL,
} as const;
