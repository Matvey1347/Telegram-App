const { resolve } = require("node:path");

module.exports = (config) => ({
  ...config,
  output: { ...config.output, path: resolve(__dirname, "dist/finance-dev") },
});
