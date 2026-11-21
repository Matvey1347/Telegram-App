export const publicWebEnvironment = {
  liveMode: process.env.NEXT_PUBLIC_NEXELOQ_LIVE_MODE,
  databaseEnvironment: process.env.NEXT_PUBLIC_DATABASE_ENV,
  isDevelopment: process.env.NODE_ENV === "development",
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
} as const;
