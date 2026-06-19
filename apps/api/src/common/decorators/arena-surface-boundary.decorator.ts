import { SetMetadata } from "@nestjs/common";

export type ArenaSurfaceBoundary =
  | "public"
  | "adjudication"
  | "validation"
  | "requester"
  | "internal";

export const ARENA_SURFACE_BOUNDARY_KEY = "arenaSurfaceBoundary";

export const ArenaSurfaceBoundary = (boundary: ArenaSurfaceBoundary) =>
  SetMetadata(ARENA_SURFACE_BOUNDARY_KEY, boundary);
