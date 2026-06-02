import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";
import { WorkerModule } from "./worker.module";

type ProcessRole = "api" | "worker" | "all";

type BootstrapLoggerApp = {
  get(token: unknown): unknown;
  useLogger(logger: unknown): void;
  init?(): Promise<unknown> | unknown;
};

type BootstrapApiApp = BootstrapLoggerApp & {
  enableCors(): void;
  useGlobalPipes(...pipes: unknown[]): void;
  listen(port: number): Promise<unknown> | unknown;
};

type BootstrapDependencies = {
  requestedRole?: ProcessRole;
  createApp?: (
    module: unknown,
    options: { bufferLogs: true },
  ) => Promise<BootstrapApiApp>;
  createApplicationContext?: (
    module: unknown,
    options: { bufferLogs: true },
  ) => Promise<BootstrapLoggerApp>;
  appModule?: unknown;
  workerModule?: unknown;
  createSwaggerDocument?: (app: unknown) => unknown;
  setupSwagger?: (path: string, app: unknown, document: unknown) => void;
};

export type BootstrapResult = {
  apiApp: BootstrapApiApp | null;
  workerApp: BootstrapLoggerApp | null;
};

function createDefaultSwaggerDocument(app: unknown) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Arena API")
    .setDescription("Arena infrastructure and platform API skeleton")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app as never, swaggerConfig);
}

async function startWorkerContext(
  createApplicationContext: NonNullable<BootstrapDependencies["createApplicationContext"]>,
  workerModule: unknown,
) {
  const workerApp = await createApplicationContext(workerModule, {
    bufferLogs: true,
  });
  const logger = workerApp.get(Logger) as Logger;
  const config = workerApp.get(AppConfigService) as AppConfigService;

  workerApp.useLogger(logger);
  if (typeof workerApp.init === "function") {
    await workerApp.init();
  }
  logger.log(`Arena worker process started with role ${config.processRole}`);

  return workerApp;
}

async function startApiApp(
  createApp: NonNullable<BootstrapDependencies["createApp"]>,
  appModule: unknown,
  createSwaggerDocument: NonNullable<BootstrapDependencies["createSwaggerDocument"]>,
  setupSwagger: NonNullable<BootstrapDependencies["setupSwagger"]>,
) {
  const app = await createApp(appModule, { bufferLogs: true });
  const config = app.get(AppConfigService) as AppConfigService;
  const logger = app.get(Logger) as Logger;

  app.useLogger(logger);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const document = createSwaggerDocument(app);
  setupSwagger("docs", app, document);

  await app.listen(config.port);
  logger.log(
    `Arena API listening on port ${config.port} with role ${config.processRole}`,
  );

  return app;
}

export async function bootstrap(
  dependencies: BootstrapDependencies = {},
): Promise<BootstrapResult> {
  const requestedRole = dependencies.requestedRole ??
    ((process.env.ARENA_PROCESS_ROLE ?? "all") as ProcessRole);
  const createApp =
    dependencies.createApp ??
    ((module: unknown, options: { bufferLogs: true }) =>
      NestFactory.create(module as never, options));
  const createApplicationContext =
    dependencies.createApplicationContext ??
    ((module: unknown, options: { bufferLogs: true }) =>
      NestFactory.create(module as never, options));
  const appModule = dependencies.appModule ?? AppModule;
  const workerModule = dependencies.workerModule ?? WorkerModule;
  const createSwaggerDocument =
    dependencies.createSwaggerDocument ?? createDefaultSwaggerDocument;
  const setupSwagger = dependencies.setupSwagger ?? SwaggerModule.setup;

  if (requestedRole === "worker") {
    return {
      apiApp: null,
      workerApp: await startWorkerContext(
        createApplicationContext,
        workerModule,
      ),
    };
  }

  const workerApp =
    requestedRole === "all"
      ? await startWorkerContext(createApplicationContext, workerModule)
      : null;

  return {
    apiApp: await startApiApp(
      createApp,
      appModule,
      createSwaggerDocument,
      setupSwagger,
    ),
    workerApp,
  };
}
