import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";

import {
  ARENA_RATE_LIMIT_KEY,
  type ArenaRateLimitPolicy,
  type ArenaResolvedRateLimitPolicy,
} from "../decorators/arena-rate-limit.decorator";
import {
  ARENA_SURFACE_BOUNDARY_KEY,
  type ArenaSurfaceBoundary,
} from "../decorators/arena-surface-boundary.decorator";
import type { RequestWithUser } from "../interfaces/request-with-user.interface";
import { AppConfigService } from "../../config/app-config.service";
import { RedisService } from "../../queue/redis.service";

type PathMetadata = string | string[] | undefined;

@Injectable()
export class ArenaRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<"http">() !== "http") {
      return true;
    }

    const policy = this.resolvePolicy(context);
    if (!policy) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<Response>();
    const actorKey = this.resolveActorKey(request, policy.keyStrategy);
    const routeKey = this.resolveRouteKey(context);
    const redisKey = `rate_limit:${policy.bucket}:${routeKey}:${actorKey}`;
    const counter = await this.redis.incrementWindowCounter(
      redisKey,
      policy.windowSeconds,
    );

    if (counter.count <= policy.limit) {
      return true;
    }

    response.setHeader("Retry-After", String(Math.max(counter.ttlSeconds, 1)));
    throw new HttpException(
      {
        message: "Too many requests for this action. Please retry later.",
        details: {
          limit: policy.limit,
          windowSeconds: policy.windowSeconds,
          retryAfterSeconds: Math.max(counter.ttlSeconds, 1),
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private resolvePolicy(
    context: ExecutionContext,
  ): ArenaResolvedRateLimitPolicy | null {
    const controller = context.getClass();
    const handler = context.getHandler();
    const explicitPolicy =
      this.reflector.getAllAndOverride<ArenaRateLimitPolicy>(
        ARENA_RATE_LIMIT_KEY,
        [handler, controller],
      );

    if (explicitPolicy) {
      const configuredPolicy = this.config.resolveArenaRateLimit(
        explicitPolicy.bucket,
      );
      return {
        ...configuredPolicy,
        ...explicitPolicy,
        keyStrategy: explicitPolicy.keyStrategy ?? configuredPolicy.keyStrategy,
      };
    }

    const boundary = this.reflector.getAllAndOverride<ArenaSurfaceBoundary>(
      ARENA_SURFACE_BOUNDARY_KEY,
      [handler, controller],
    );

    if (boundary !== "internal") {
      return null;
    }

    return this.config.resolveArenaRateLimit("internal");
  }

  private resolveActorKey(
    request: RequestWithUser,
    keyStrategy: ArenaResolvedRateLimitPolicy["keyStrategy"],
  ): string {
    if (keyStrategy === "user") {
      const userId = request.user?.sub;
      if (typeof userId === "string" && userId.trim().length > 0) {
        return `user:${userId.trim()}`;
      }
    }

    return `client:${this.resolveClientIdentity(request)}`;
  }

  private resolveClientIdentity(request: RequestWithUser): string {
    const forwarded =
      this.extractHeaderIp(request.headers["x-forwarded-for"]) ??
      this.extractHeaderIp(request.headers["x-real-ip"]);
    if (forwarded) {
      return forwarded.toLowerCase();
    }

    const requestIp =
      typeof request.ip === "string" && request.ip.trim().length > 0
        ? request.ip
        : undefined;
    const socketIp =
      typeof request.socket?.remoteAddress === "string" &&
      request.socket.remoteAddress.trim().length > 0
        ? request.socket.remoteAddress
        : undefined;

    return (requestIp ?? socketIp ?? "unknown").toLowerCase();
  }

  private extractHeaderIp(
    value: string | string[] | undefined,
  ): string | undefined {
    const headerValue = Array.isArray(value) ? value[0] : value;
    if (typeof headerValue !== "string") {
      return undefined;
    }

    const ip = headerValue.split(",")[0]?.trim();
    return ip && ip.length > 0 ? ip : undefined;
  }

  private resolveRouteKey(context: ExecutionContext): string {
    const controllerPath = this.normalizePath(
      Reflect.getMetadata(PATH_METADATA, context.getClass()) as PathMetadata,
    );
    const handlerPath = this.normalizePath(
      Reflect.getMetadata(PATH_METADATA, context.getHandler()) as PathMetadata,
    );
    const pathSegments = [controllerPath, handlerPath].filter(
      (segment) => segment.length > 0,
    );

    return pathSegments.length > 0
      ? pathSegments.join("/")
      : context.getClass().name;
  }

  private normalizePath(value: PathMetadata): string {
    if (Array.isArray(value)) {
      return value.join("/").replace(/^\/+|\/+$/gu, "");
    }

    if (typeof value === "string") {
      return value.replace(/^\/+|\/+$/gu, "");
    }

    return "";
  }
}
