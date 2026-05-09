import type { JwtIdentity } from "@arena/shared";
import type { Request } from "express";

export interface RequestWithUser extends Request {
  id: string;
  requestId?: string;
  traceId?: string;
  user?: JwtIdentity;
}
