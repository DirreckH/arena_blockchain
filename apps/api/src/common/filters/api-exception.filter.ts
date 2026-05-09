import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { PinoLogger } from "nestjs-pino";

import {
  ArenaDomainError,
  ArenaNotFoundError,
} from "../../arena/arena.errors";
import type { ApiErrorBody, ApiErrorResponse } from "../interfaces/api-error-response.interface";
import type { RequestWithUser } from "../interfaces/request-with-user.interface";

interface DependencyFailure {
  dependency: "database" | "redis" | "rpc" | "infrastructure";
  details: string;
}

interface ArenaDomainFailure {
  code: string;
  message: string;
  statusCode: number;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();

    const arenaDomainFailure = this.resolveArenaDomainFailure(exception);
    const dependencyFailure = this.resolveDependencyFailure(exception);
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : arenaDomainFailure
          ? arenaDomainFailure.statusCode
        : dependencyFailure
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorBody = this.buildErrorBody(
      exception,
      arenaDomainFailure,
      dependencyFailure,
      statusCode,
    );
    const payload: ApiErrorResponse = {
      success: false,
      error: errorBody,
      requestId: request.requestId ?? request.id,
      traceId: request.traceId,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };

    const logPayload = {
      requestId: payload.requestId,
      traceId: payload.traceId,
      path: payload.path,
      method: request.method,
      statusCode,
      errorCode: payload.error.code,
      details: payload.error.details,
      walletAddress: request.user?.walletAddress,
      userId: request.user?.sub,
      err: exception instanceof Error ? exception : undefined,
    };

    if (statusCode >= 500) {
      this.logger.error(logPayload, payload.error.message);
    } else {
      this.logger.warn(logPayload, payload.error.message);
    }

    response.status(statusCode).json(payload);
  }

  private buildErrorBody(
    exception: unknown,
    arenaDomainFailure: ArenaDomainFailure | null,
    dependencyFailure: DependencyFailure | null,
    statusCode: number,
  ): ApiErrorBody {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === "string") {
        return {
          code: this.codeForStatus(statusCode),
          message: response,
        };
      }

      if (response && typeof response === "object") {
        const body = response as Record<string, unknown>;
        const message = body.message;
        const details =
          Array.isArray(message) && statusCode === HttpStatus.BAD_REQUEST
            ? { issues: message }
            : body.details;

        return {
          code: this.resolveHttpCode(statusCode, body, details),
          message: this.resolveHttpMessage(statusCode, body, details),
          details,
        };
      }
    }

    if (arenaDomainFailure) {
      return {
        code: arenaDomainFailure.code,
        message: arenaDomainFailure.message,
      };
    }

    if (dependencyFailure) {
      return {
        code: "DEPENDENCY_UNAVAILABLE",
        message: `Required ${dependencyFailure.dependency} dependency is unavailable`,
        details: {
          dependency: dependencyFailure.dependency,
          reason: dependencyFailure.details,
        },
      };
    }

    if (exception instanceof Error) {
      return {
        code: "INTERNAL_SERVER_ERROR",
        message: exception.message || "Unexpected server error",
      };
    }

    return {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
    };
  }

  private resolveHttpCode(
    statusCode: number,
    body: Record<string, unknown>,
    details: unknown,
  ): string {
    if (typeof body.code === "string" && body.code.length > 0) {
      return body.code;
    }

    if (statusCode === HttpStatus.BAD_REQUEST && details) {
      return "VALIDATION_ERROR";
    }

    return this.codeForStatus(statusCode);
  }

  private resolveArenaDomainFailure(exception: unknown): ArenaDomainFailure | null {
    if (!(exception instanceof ArenaDomainError)) {
      return null;
    }

    return {
      code: exception.code || this.codeForStatus(HttpStatus.CONFLICT),
      message: exception.message || "Request failed",
      statusCode:
        exception instanceof ArenaNotFoundError
          ? HttpStatus.NOT_FOUND
          : HttpStatus.CONFLICT,
    };
  }

  private resolveHttpMessage(
    statusCode: number,
    body: Record<string, unknown>,
    details: unknown,
  ): string {
    if (typeof body.message === "string" && body.message.length > 0) {
      return body.message;
    }

    if (statusCode === HttpStatus.BAD_REQUEST && details) {
      return "Request validation failed";
    }

    if (typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }

    return "Request failed";
  }

  private codeForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.SERVICE_UNAVAILABLE:
        return "DEPENDENCY_UNAVAILABLE";
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }

  private resolveDependencyFailure(exception: unknown): DependencyFailure | null {
    if (!(exception instanceof Error)) {
      return null;
    }

    const message = exception.message.toLowerCase();
    const errorCode =
      typeof (exception as { code?: unknown }).code === "string"
        ? String((exception as { code?: string }).code).toUpperCase()
        : "";
    const name = exception.name.toLowerCase();

    if (
      name.includes("prisma") ||
      errorCode.startsWith("P10") ||
      message.includes("database") ||
      message.includes("system_key_value")
    ) {
      return {
        dependency: "database",
        details: exception.message,
      };
    }

    if (
      message.includes("redis") ||
      message.includes("econnrefused") ||
      message.includes("connection is closed") ||
      name.includes("maxretriesperrequesterror")
    ) {
      return {
        dependency: "redis",
        details: exception.message,
      };
    }

    if (
      errorCode === "NETWORK_ERROR" ||
      errorCode === "SERVER_ERROR" ||
      errorCode === "TIMEOUT" ||
      message.includes("chain id") ||
      message.includes("could not detect network") ||
      message.includes("missing response") ||
      message.includes("contract artifact")
    ) {
      return {
        dependency: "rpc",
        details: exception.message,
      };
    }

    return null;
  }
}
