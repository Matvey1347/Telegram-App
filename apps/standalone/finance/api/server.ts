import express from "express";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { createFinanceApp } from "./src/create-finance-app";

const app: express.Express = express();
void NestFactory;

// Vercel invokes the exported Express application. Nest is mounted once per
// warm function instance, keeping the same HTTP contract as the standalone
// Finance API without binding a TCP port.
const initialized = createFinanceApp(new ExpressAdapter(app));

app.use(async (_request, _response, next) => {
  try {
    await initialized;
    next();
  } catch (error) {
    next(error);
  }
});

export default app;
