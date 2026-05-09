import { Injectable } from "@nestjs/common";
import type { Prisma, Proposition } from "@prisma/client";
import type {
  ComputedUserTag,
  RespondentTagInternalViewModel,
  RespondentTagSummaryViewModel,
  UserTag as SharedUserTag,
} from "@arena/shared";
import { RespondentTagEngine } from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import { ArenaIdService } from "../arena-id.service";
import { withArenaTransaction } from "../arena-transaction.utils";
import { toSharedUserReputation, toSharedUserTag } from "../arena-view.mapper";
import type { ArenaDbClient } from "../prisma.types";
import { PropositionRepository } from "../repositories/proposition.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { UserReputationRepository } from "../repositories/user-reputation.repository";
import { UserTagRepository } from "../repositories/user-tag.repository";
import { toDate, type TimestampInput } from "../arena.utils";

const ACTIVE_TAG_VALUE = "active";

@Injectable()
export class TagService {
  private readonly engine = new RespondentTagEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly responses: ResponseRepository,
    private readonly propositions: PropositionRepository,
    private readonly reputations: UserReputationRepository,
    private readonly tags: UserTagRepository,
  ) {}

  async refreshForUser(
    userId: string,
    refreshedAt?: TimestampInput,
    db?: ArenaDbClient,
  ): Promise<SharedUserTag[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const refreshedAtDate = refreshedAt ? toDate(refreshedAt) : new Date();
      const [reputationRecord, existingTags, responses] = await Promise.all([
        this.reputations.findByUserId(userId, tx),
        this.tags.listByUser(userId, tx),
        this.responses.listLatestByUser(userId, tx),
      ]);

      const propositionById = new Map(
        (
          await this.propositions.listByIds(
            Array.from(new Set(responses.map((response) => response.propositionId))),
            tx,
          )
        ).map((proposition) => [proposition.id, proposition] as const),
      );
      const responsePropositions = responses.map((response) =>
        propositionById.get(response.propositionId),
      );

      const nextTags = this.engine.compute({
        reputation: toSharedUserReputation(reputationRecord),
        categoryParticipation: this.buildCategoryParticipation(responsePropositions),
        totalCategorizedResponses: responsePropositions.filter(Boolean).length,
      });

      const existingByKey = new Map(
        existingTags.map((tag) => [tag.tagKey, tag] as const),
      );
      const currentKeys = new Set(nextTags.map((tag) => tag.tagKey));

      const persisted = await Promise.all(
        nextTags.map(async (tag) => {
          const existing = existingByKey.get(tag.tagKey);
          const activatedAt =
            existing && existing.expiresAt === null
              ? existing.activatedAt
              : refreshedAtDate;

          return this.tags.upsertByUserIdAndTagKey(
            userId,
            tag.tagKey,
            {
              id: existing?.id ?? this.ids.next("user-tag"),
              userId,
              tagKey: tag.tagKey,
              tagType: tag.tagType,
              tagValue: tag.tagValue,
              confidenceScore: tag.confidenceScore,
              sourceType: tag.sourceType,
              ruleVersion: tag.ruleVersion,
              metadataJson: tag.metadata as unknown as Prisma.InputJsonValue,
              activatedAt,
              expiresAt: null,
            },
            this.toPersistenceInput(tag, activatedAt.toISOString(), null),
            tx,
          );
        }),
      );

      await Promise.all(
        existingTags
          .filter((tag) => tag.expiresAt === null && !currentKeys.has(tag.tagKey))
          .map((tag) =>
            this.tags.update(
              tag.id,
              {
                expiresAt: refreshedAtDate,
              },
              tx,
            ),
          ),
      );

      return persisted
        .map((tag) => toSharedUserTag(tag))
        .filter((tag): tag is SharedUserTag => tag !== null);
    });
  }

  async listCurrentByUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<SharedUserTag[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const currentTags = await this.tags.listCurrentByUser(userId, tx);
      if (currentTags.length > 0) {
        return currentTags
          .map((tag) => toSharedUserTag(tag))
          .filter((tag): tag is SharedUserTag => tag !== null);
      }

      return this.refreshForUser(userId, undefined, tx);
    });
  }

  async getSummaryForUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<RespondentTagSummaryViewModel> {
    const tags = await this.listCurrentByUser(userId, db);

    return {
      userId,
      tags: tags.map((tag) => ({
        tagKey: tag.tagKey,
        tagType: tag.tagType,
        confidenceScore: tag.confidenceScore,
        activatedAt: tag.activatedAt,
      })),
    };
  }

  async getInternalViewForUser(
    userId: string,
    db?: ArenaDbClient,
  ): Promise<RespondentTagInternalViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const tags = await this.tags.listByUser(userId, tx);
      if (tags.length === 0) {
        await this.refreshForUser(userId, undefined, tx);
      }

      const currentTags = await this.tags.listByUser(userId, tx);

      return {
        userId,
        tags: currentTags.map((tag) => ({
          tagKey: tag.tagKey,
          tagType: tag.tagType,
          tagValue: tag.tagValue,
          confidenceScore: tag.confidenceScore,
          sourceType: tag.sourceType,
          ruleVersion: tag.ruleVersion,
          metadata: tag.metadataJson,
          activatedAt: tag.activatedAt.toISOString(),
          expiresAt: tag.expiresAt?.toISOString() ?? null,
          updatedAt: tag.updatedAt.toISOString(),
        })),
      };
    });
  }

  private buildCategoryParticipation(
    propositions: Array<Proposition | undefined>,
  ): Array<{
    category: Proposition["category"];
    responseCount: number;
    share: number;
  }> {
    const counts = new Map<Proposition["category"], number>();

    for (const proposition of propositions) {
      if (!proposition) {
        continue;
      }

      counts.set(
        proposition.category,
        (counts.get(proposition.category) ?? 0) + 1,
      );
    }

    const total = propositions.filter(Boolean).length;

    return Array.from(counts.entries()).map(([category, responseCount]) => ({
      category,
      responseCount,
      share: total === 0 ? 0 : responseCount / total,
    }));
  }

  private toPersistenceInput(
    tag: ComputedUserTag,
    activatedAt: string,
    expiresAt: string | null,
  ): Prisma.UserTagUncheckedUpdateInput {
    return {
      tagType: tag.tagType,
      tagValue: tag.tagValue || ACTIVE_TAG_VALUE,
      confidenceScore: tag.confidenceScore,
      sourceType: tag.sourceType,
      ruleVersion: tag.ruleVersion,
      metadataJson: tag.metadata as unknown as Prisma.InputJsonValue,
      activatedAt: toDate(activatedAt),
      expiresAt: expiresAt ? toDate(expiresAt) : null,
    };
  }
}
