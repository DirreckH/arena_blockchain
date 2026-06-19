import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES,
  type RespondentAccountPreferencesViewModel,
  type UpdateRespondentAccountPreferencesInput,
} from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import { ArenaIdService } from "../arena-id.service";
import type { ArenaDbClient } from "../prisma.types";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";

type StoredPreferences = UpdateRespondentAccountPreferencesInput;

const ACCOUNT_PREFERENCES_NAMESPACE = "arena.account.preferences";

function clonePreferences<T>(value: T): T {
  return structuredClone(value);
}

function buildDefaultPreferences(): StoredPreferences {
  return clonePreferences(DEFAULT_RESPONDENT_ACCOUNT_PREFERENCES);
}

function mergeStoredPreferences(
  stored: unknown,
): StoredPreferences {
  if (!stored || typeof stored !== "object") {
    return buildDefaultPreferences();
  }

  const next = buildDefaultPreferences();
  const source = stored as Record<string, unknown>;

  for (const key of Object.keys(next) as Array<keyof StoredPreferences>) {
    const section = source[key];
    if (!section || typeof section !== "object") {
      continue;
    }

    Object.assign(
      next[key] as unknown as Record<string, unknown>,
      section as Record<string, unknown>,
    );
  }

  return next;
}

@Injectable()
export class AccountPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
  ) {}

  async getAccountPreferencesForUser(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<RespondentAccountPreferencesViewModel> {
    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(userId),
      db,
    );

    const preferences = mergeStoredPreferences(record?.valueJson ?? null);

    return {
      ...preferences,
      updatedAt: record?.updatedAt.toISOString() ?? null,
    };
  }

  async updateAccountPreferencesForUser(
    userId: string,
    input: UpdateRespondentAccountPreferencesInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<RespondentAccountPreferencesViewModel> {
    const normalized = mergeStoredPreferences(input);
    const key = this.buildStorageKey(userId);

    const record = await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena account preferences for ${userId}`,
        valueJson: normalized as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena account preferences for ${userId}`,
        valueJson: normalized as unknown as Prisma.InputJsonValue,
      },
      db,
    );

    return {
      ...normalized,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private buildStorageKey(userId: string): string {
    return `${ACCOUNT_PREFERENCES_NAMESPACE}.${userId}`;
  }
}
