import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import type { SystemRole } from "@arena/shared";

import {
  ARENA_SURFACE_BOUNDARY_KEY,
  type ArenaSurfaceBoundary,
} from "../decorators/arena-surface-boundary.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ROLES_KEY } from "../decorators/roles.decorator";

type BoundaryContract = {
  prefixes: string[];
  requiresPublic: boolean;
  requiresRoles: boolean;
};

const BOUNDARY_CONTRACTS: Record<ArenaSurfaceBoundary, BoundaryContract> = {
  public: {
    prefixes: ["arena/public"],
    requiresPublic: true,
    requiresRoles: false,
  },
  adjudication: {
    prefixes: ["arena/adjudication"],
    requiresPublic: false,
    requiresRoles: false,
  },
  validation: {
    prefixes: ["arena/validation", "arena/discussion"],
    requiresPublic: false,
    requiresRoles: false,
  },
  requester: {
    prefixes: ["arena/propositions"],
    requiresPublic: false,
    requiresRoles: false,
  },
  internal: {
    prefixes: ["arena/internal"],
    requiresPublic: false,
    requiresRoles: true,
  },
};

@Injectable()
export class ArenaSurfaceBoundaryGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const controller = context.getClass();
    const handler = context.getHandler();
    const controllerPath = Reflect.getMetadata(
      PATH_METADATA,
      controller,
    ) as string | string[] | undefined;
    const normalizedControllerPath = this.normalizePath(controllerPath);

    if (!normalizedControllerPath.startsWith("arena/")) {
      return true;
    }

    const boundary = this.reflector.getAllAndOverride<ArenaSurfaceBoundary>(
      ARENA_SURFACE_BOUNDARY_KEY,
      [handler, controller],
    );
    if (!boundary) {
      throw new InternalServerErrorException(
        `Arena surface boundary metadata is required for ${controller.name}.`,
      );
    }

    const contract = BOUNDARY_CONTRACTS[boundary];
    if (
      !contract.prefixes.some((prefix) =>
        normalizedControllerPath.startsWith(prefix),
      )
    ) {
      throw new InternalServerErrorException(
        `Arena ${boundary} surface on ${controller.name} must use one of: ${contract.prefixes.join(", ")}.`,
      );
    }

    const isPublic =
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        controller,
      ]) === true;
    const requiredRoles =
      this.reflector.getAllAndOverride<SystemRole[]>(ROLES_KEY, [
        handler,
        controller,
      ]) ?? [];

    if (contract.requiresPublic && !isPublic) {
      throw new InternalServerErrorException(
        `Arena ${boundary} surface on ${controller.name} must be marked @Public().`,
      );
    }

    if (!contract.requiresPublic && isPublic) {
      throw new InternalServerErrorException(
        `Arena ${boundary} surface on ${controller.name} must not be marked @Public().`,
      );
    }

    if (contract.requiresRoles && requiredRoles.length === 0) {
      throw new InternalServerErrorException(
        `Arena ${boundary} surface on ${controller.name} must declare @Roles(...).`,
      );
    }

    return true;
  }

  private normalizePath(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
      return value.join("/").replace(/^\/+|\/+$/gu, "");
    }

    if (typeof value === "string") {
      return value.replace(/^\/+|\/+$/gu, "");
    }

    return "";
  }
}
