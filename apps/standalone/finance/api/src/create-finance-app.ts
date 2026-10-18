import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { FinanceRuntimeConfig } from "./config/finance-runtime-config";
import { FinanceApiModule } from "./finance-api.module";

/**
 * Creates the Finance HTTP application without binding a TCP listener.
 *
 * The standalone host calls `listen`; the Vercel adapter initializes this
 * exact application in a Node function and forwards the incoming request.
 */
export async function createFinanceApp(adapter?: ExpressAdapter) {
  const app = adapter
    ? await NestFactory.create(FinanceApiModule, adapter, { rawBody: true })
    : await NestFactory.create(FinanceApiModule, { rawBody: true });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const runtime = app.get(FinanceRuntimeConfig);
  if (runtime.webPublicUrl) {
    app.enableCors({ origin: runtime.webPublicUrl });
  }
  await app.init();
  return app;
}
