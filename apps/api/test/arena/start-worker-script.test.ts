import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Module from "node:module";
import path from "node:path";

type ModuleWithPrivateLoad = typeof Module & {
  _load: (
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ) => unknown;
};

describe("start-worker script", () => {
  it("forces worker role and invokes bootstrap-runtime directly", async () => {
    const scriptPath = path.resolve(
      __dirname,
      "../../scripts/start-worker.cjs",
    );
    const moduleWithPrivateLoad = Module as ModuleWithPrivateLoad;
    const originalLoad = moduleWithPrivateLoad._load;
    const originalRole = process.env.ARENA_PROCESS_ROLE;
    const bootstrapCalls: Array<{ requestedRole?: string }> = [];

    moduleWithPrivateLoad._load = function patchedLoad(request, parent, isMain) {
      if (
        typeof request === "string" &&
        request.endsWith("dist/apps/api/src/bootstrap-runtime.js")
      ) {
        return {
          bootstrap: (options: { requestedRole?: string }) => {
            bootstrapCalls.push(options);
            return Promise.resolve();
          },
        };
      }

      return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[scriptPath];
    delete process.env.ARENA_PROCESS_ROLE;

    try {
      require(scriptPath);
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(process.env.ARENA_PROCESS_ROLE, "worker");
      assert.deepEqual(bootstrapCalls, [{ requestedRole: "worker" }]);
    } finally {
      moduleWithPrivateLoad._load = originalLoad;
      delete require.cache[scriptPath];

      if (originalRole === undefined) {
        delete process.env.ARENA_PROCESS_ROLE;
      } else {
        process.env.ARENA_PROCESS_ROLE = originalRole;
      }
    }
  });
});
