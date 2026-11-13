/** Public configuration for the standalone Finance host only. */
export const publicFinanceWebEnvironment = {
  databaseEnvironment: process.env.NEXT_PUBLIC_DATABASE_ENV,
  isDevelopment: process.env.NODE_ENV === "development",
  apiUrl: process.env.NEXT_PUBLIC_FINANCE_API_URL,
} as const;
