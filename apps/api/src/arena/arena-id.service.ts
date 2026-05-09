import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

@Injectable()
export class ArenaIdService {
  next(namespace: string): string {
    return `${namespace}_${randomUUID()}`;
  }
}
