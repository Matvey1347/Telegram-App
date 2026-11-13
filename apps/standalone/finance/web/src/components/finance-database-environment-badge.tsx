import { publicFinanceWebEnvironment } from "@finance-web/config/public-env";

export function FinanceDatabaseEnvironmentBadge() {
  if (!publicFinanceWebEnvironment.isDevelopment || publicFinanceWebEnvironment.databaseEnvironment !== "local") return null;
  return <div className="finance-database-badge" role="status" aria-label="Local database connected">LOCAL DATABASE</div>;
}
