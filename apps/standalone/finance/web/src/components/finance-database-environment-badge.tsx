import { publicFinanceWebEnvironment } from "@finance-web/config/public-env";
import { resolve } from "node:path";
import { localDatabaseEnvironment } from "../../../../../../scripts/dev-database-environment.mjs";

export function FinanceDatabaseEnvironmentBadge() {
  if (!publicFinanceWebEnvironment.isDevelopment) return null;
  const databaseEnvironment = publicFinanceWebEnvironment.databaseEnvironment
    ?? localDatabaseEnvironment(process.env, resolve(process.cwd(), "../../../../.env"));
  if (databaseEnvironment !== "local") return null;
  return <div className="finance-database-badge" role="status" aria-label="Local database connected">LOCAL DATABASE</div>;
}
