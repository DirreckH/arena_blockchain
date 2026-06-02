import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bootstrap } from "../../src/bootstrap-runtime";

class FakeLogger {
  readonly messages: string[] = [];

  log(message: string): void {
    this.messages.push(message);
  }
}

function createFakeConfig(processRole: "api" | "worker" | "all", port = 4000) {
  return {
    processRole,
    port,
  };
}

function createWorkerContext(options: {
  logger: FakeLogger;
  config: ReturnType<typeof createFakeConfig>;
}) {
  return {
    loggerUsed: null as FakeLogger | null,
    get(token: { name?: string }) {
      if (token?.name === "Logger") {
        return options.logger;
      }
      if (token?.name === "AppConfigService") {
        return options.config;
      }
      throw new Error(`Unexpected worker token: ${String(token?.name)}`);
    },
    useLogger(logger: FakeLogger) {
      this.loggerUsed = logger;
    },
  };
}

function createApiApp(options: {
  logger: FakeLogger;
  config: ReturnType<typeof createFakeConfig>;
}) {
  return {
    corsEnabled: false,
    loggerUsed: null as FakeLogger | null,
    listenPort: null as number | null,
    globalPipes: [] as unknown[],
    get(token: { name?: string }) {
      if (token?.name === "Logger") {
        return options.logger;
      }
      if (token?.name === "AppConfigService") {
        return options.config;
      }
      throw new Error(`Unexpected api token: ${String(token?.name)}`);
    },
    useLogger(logger: FakeLogger) {
      this.loggerUsed = logger;
    },
    enableCors() {
      this.corsEnabled = true;
    },
    useGlobalPipes(...pipes: unknown[]) {
      this.globalPipes.push(...pipes);
    },
    async listen(port: number) {
      this.listenPort = port;
    },
  };
}

describe("process role bootstrap", () => {
  it("starts both the worker context and API app when role=all", async () => {
    const bootOrder: string[] = [];
    const workerLogger = new FakeLogger();
    const apiLogger = new FakeLogger();
    const workerConfig = createFakeConfig("all");
    const apiConfig = createFakeConfig("all");
    const workerApp = createWorkerContext({
      logger: workerLogger,
      config: workerConfig,
    });
    const apiApp = createApiApp({
      logger: apiLogger,
      config: apiConfig,
    });

    const result = await bootstrap({
      requestedRole: "all",
      createApplicationContext: async () => {
        bootOrder.push("worker");
        return workerApp as never;
      },
      createApp: async () => {
        bootOrder.push("api");
        return apiApp as never;
      },
      createSwaggerDocument: () => ({}),
      setupSwagger: () => {},
    });

    assert.deepEqual(bootOrder, ["worker", "api"]);
    assert.equal(result.workerApp, workerApp);
    assert.equal(result.apiApp, apiApp);
    assert.equal(workerApp.loggerUsed, workerLogger);
    assert.equal(apiApp.loggerUsed, apiLogger);
    assert.equal(apiApp.corsEnabled, true);
    assert.equal(apiApp.listenPort, 4000);
    assert.equal(apiApp.globalPipes.length, 1);
    assert.match(
      workerLogger.messages.join("\n"),
      /Arena worker process started with role all/,
    );
    assert.match(
      apiLogger.messages.join("\n"),
      /Arena API listening on port 4000 with role all/,
    );
  });

  it("starts only the worker context when role=worker", async () => {
    const workerLogger = new FakeLogger();
    const workerConfig = createFakeConfig("worker");
    const workerApp = createWorkerContext({
      logger: workerLogger,
      config: workerConfig,
    });
    let apiBooted = false;

    const result = await bootstrap({
      requestedRole: "worker",
      createApplicationContext: async () => workerApp as never,
      createApp: async () => {
        apiBooted = true;
        return createApiApp({
          logger: new FakeLogger(),
          config: createFakeConfig("worker"),
        }) as never;
      },
      createSwaggerDocument: () => ({}),
      setupSwagger: () => {},
    });

    assert.equal(result.workerApp, workerApp);
    assert.equal(result.apiApp, null);
    assert.equal(apiBooted, false);
    assert.match(
      workerLogger.messages.join("\n"),
      /Arena worker process started with role worker/,
    );
  });

  it("starts only the API app when role=api", async () => {
    const apiLogger = new FakeLogger();
    const apiConfig = createFakeConfig("api", 4100);
    const apiApp = createApiApp({
      logger: apiLogger,
      config: apiConfig,
    });
    let workerBooted = false;

    const result = await bootstrap({
      requestedRole: "api",
      createApplicationContext: async () => {
        workerBooted = true;
        return createWorkerContext({
          logger: new FakeLogger(),
          config: createFakeConfig("api"),
        }) as never;
      },
      createApp: async () => apiApp as never,
      createSwaggerDocument: () => ({}),
      setupSwagger: () => {},
    });

    assert.equal(result.workerApp, null);
    assert.equal(result.apiApp, apiApp);
    assert.equal(workerBooted, false);
    assert.equal(apiApp.listenPort, 4100);
    assert.match(
      apiLogger.messages.join("\n"),
      /Arena API listening on port 4100 with role api/,
    );
  });
});
