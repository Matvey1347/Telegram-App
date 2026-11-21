import { reportStartupFailure, runProductionDevelopment } from "../dev/dev-production.mjs";

runProductionDevelopment("operator", process.argv.slice(2))
  .then((code) => { process.exitCode = code; })
  .catch(reportStartupFailure);
