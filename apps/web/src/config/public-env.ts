export const publicWebEnvironment = {
  databaseEnvironment: process.env.NEXT_PUBLIC_DATABASE_ENV,
  isDevelopment: process.env.NODE_ENV === "development",
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
} as const;
