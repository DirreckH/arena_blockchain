import "reflect-metadata";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { Controller, Get } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { SystemRole } from "@arena/shared";

import {
  ArenaSurfaceBoundary,
  ARENA_SURFACE_BOUNDARY_KEY,
} from "../../src/common/decorators/arena-surface-boundary.decorator";
import { Public } from "../../src/common/decorators/public.decorator";
import { Roles } from "../../src/common/decorators/roles.decorator";
import { ArenaSurfaceBoundaryGuard } from "../../src/common/guards/arena-surface-boundary.guard";

const ARENA_CONTROLLER_DIR = path.resolve(__dirname, "../../src/arena");

@ArenaSurfaceBoundary("public")
@Public()
@Controller("arena/public/probe")
class PublicProbeController {
  @Get()
  list() {
    return { ok: true };
  }
}

@Public()
@Controller("arena/public/missing-boundary")
class MissingBoundaryController {
  @Get()
  list() {
    return { ok: true };
  }
}

@ArenaSurfaceBoundary("validation")
@Public()
@Controller("arena/public/mismatched-boundary")
class MismatchedBoundaryController {
  @Get()
  list() {
    return { ok: true };
  }
}

@ArenaSurfaceBoundary("internal")
@Controller("arena/internal/missing-roles")
class MissingRolesInternalController {
  @Get()
  list() {
    return { ok: true };
  }
}

@ArenaSurfaceBoundary("internal")
@Controller("arena/internal/operator-probe")
class InternalProbeController {
  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Get()
  list() {
    return { ok: true };
  }
}

test("arena surface boundary guard allows correctly declared public and internal surfaces", () => {
  const guard = new ArenaSurfaceBoundaryGuard(new Reflector());

  assert.equal(guard.canActivate(createContext(PublicProbeController, "list")), true);
  assert.equal(guard.canActivate(createContext(InternalProbeController, "list")), true);
  assert.equal(
    Reflect.getMetadata(ARENA_SURFACE_BOUNDARY_KEY, PublicProbeController),
    "public",
  );
});

test("arena surface boundary guard rejects arena controllers without explicit boundary metadata", () => {
  const guard = new ArenaSurfaceBoundaryGuard(new Reflector());

  assert.throws(
    () => guard.canActivate(createContext(MissingBoundaryController, "list")),
    /Arena surface boundary metadata is required/u,
  );
});

test("arena surface boundary guard rejects boundary/path mismatches and missing internal roles", () => {
  const guard = new ArenaSurfaceBoundaryGuard(new Reflector());

  assert.throws(
    () => guard.canActivate(createContext(MismatchedBoundaryController, "list")),
    /must use one of: arena\/validation, arena\/discussion/u,
  );
  assert.throws(
    () => guard.canActivate(createContext(MissingRolesInternalController, "list")),
    /must declare @Roles/u,
  );
});

test("arena surface boundary guard accepts every real arena controller route contract", () => {
  const guard = new ArenaSurfaceBoundaryGuard(new Reflector());
  const controllers = loadArenaControllerClasses();

  assert.equal(controllers.length > 0, true);

  for (const controllerClass of controllers) {
    const handlers = listRouteHandlers(controllerClass);
    assert.equal(
      handlers.length > 0,
      true,
      `${controllerClass.name} should expose at least one route handler`,
    );

    for (const handlerName of handlers) {
      assert.equal(
        guard.canActivate(createContext(controllerClass, handlerName)),
        true,
        `${controllerClass.name}.${handlerName} should satisfy the arena surface boundary contract`,
      );
    }
  }
});

function createContext(
  controllerClass: new () => unknown,
  handlerName: string,
): ExecutionContext {
  const handler = (controllerClass as { prototype: Record<string, unknown> }).prototype[
    handlerName
  ] as ExecutionContext["getHandler"];

  return {
    getArgs: () => [],
    getArgByIndex: () => undefined,
    getClass: () => controllerClass,
    getHandler: () => handler,
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => ({}),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    switchToRpc: () => ({
      getContext: () => undefined,
      getData: () => undefined,
    }),
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function loadArenaControllerClasses(): Array<new () => unknown> {
  const controllerFiles = fs
    .readdirSync(ARENA_CONTROLLER_DIR)
    .filter((name) => name.endsWith(".controller.ts"))
    .sort((left, right) => left.localeCompare(right));

  return controllerFiles.map((fileName) => {
    const moduleExports = require(path.join(
      ARENA_CONTROLLER_DIR,
      fileName,
    )) as Record<string, unknown>;
    const controllers = Object.values(moduleExports).filter(
      isControllerClass,
    );

    assert.equal(
      controllers.length,
      1,
      `${fileName} should export exactly one controller class`,
    );

    return controllers[0];
  });
}

function listRouteHandlers(
  controllerClass: new () => unknown,
): string[] {
  return Object.getOwnPropertyNames(controllerClass.prototype)
    .filter((name) => name !== "constructor")
    .filter((name) => {
      const handler = controllerClass.prototype[
        name as keyof typeof controllerClass.prototype
      ];
      if (typeof handler !== "function") {
        return false;
      }

      return (
        Reflect.getMetadata(METHOD_METADATA, handler) !== undefined ||
        Reflect.getMetadata(PATH_METADATA, handler) !== undefined
      );
    });
}

function isControllerClass(value: unknown): value is new () => unknown {
  return typeof value === "function" && value.name.endsWith("Controller");
}
