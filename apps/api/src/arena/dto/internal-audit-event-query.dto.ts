import { IsEnum, IsNumberString, IsOptional, IsString } from "class-validator";

import type { InternalListSortDirection } from "../internal-ops.types";

export class InternalAuditEventQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(
    {
      asc: "asc",
      desc: "desc",
    } satisfies Record<InternalListSortDirection, InternalListSortDirection>,
  )
  sortDirection?: InternalListSortDirection;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsNumberString()
  offset?: string;
}
