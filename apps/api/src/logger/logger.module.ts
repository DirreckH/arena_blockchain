import { Global, Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { LoggerModule } from "nestjs-pino";

import { AppConfigService } from "../config/app-config.service";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProduction ? "info" : "debug",
          genReqId: (req, res) => {
            const request = req as RequestWithUser;
            const headerRequestId =
              typeof req.headers["x-request-id"] === "string"
                ? req.headers["x-request-id"].trim()
                : "";
            const headerTraceId =
              typeof req.headers["x-trace-id"] === "string"
                ? req.headers["x-trace-id"].trim()
                : "";

            const requestId =
              headerRequestId || request.requestId || request.id || randomUUID();
            const traceId = headerTraceId || request.traceId || requestId;

            request.id = requestId;
            request.requestId = requestId;
            request.traceId = traceId;

            res.setHeader("x-request-id", requestId);
            res.setHeader("x-trace-id", traceId);

            return requestId;
          },
          customProps: (req) => {
            const request = req as RequestWithUser;

            return {
              requestId: request.requestId ?? request.id,
              traceId: request.traceId,
              route: request.originalUrl ?? request.url,
              method: request.method,
              walletAddress: request.user?.walletAddress,
              userId: request.user?.sub,
            };
          },
          transport: config.isProduction
            ? undefined
            : {
                target: "pino-pretty",
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: "SYS:standard",
                },
              },
          redact: ["req.headers.authorization", "req.headers.cookie"],
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
