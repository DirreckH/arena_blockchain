import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  ArenaDiscussionCommentViewModel,
  ArenaDiscussionThreadViewModel,
  CreateArenaDiscussionCommentInput,
} from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import { ArenaIdService } from "../arena-id.service";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import type { ArenaDbClient } from "../prisma.types";
import { MarketRepository } from "../repositories/market.repository";
import { PropositionRepository } from "../repositories/proposition.repository";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";

type StoredDiscussionComment = {
  id: string;
  marketId: string;
  propositionId: string;
  userId: string;
  author: string;
  handle: string;
  tone: string;
  optionIndex: 0 | 1 | null;
  body: string;
  likes: number;
  replyCount: number;
  repliesPreview: Array<{ author: string; body: string }>;
  createdAt: string;
};

const DISCUSSION_NAMESPACE = "arena.discussion.market";

function cloneComments(
  comments: StoredDiscussionComment[],
): StoredDiscussionComment[] {
  return structuredClone(comments);
}

function parseStoredComments(value: unknown): StoredDiscussionComment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is StoredDiscussionComment => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const record = item as Partial<StoredDiscussionComment>;
    return (
      typeof record.id === "string" &&
      typeof record.marketId === "string" &&
      typeof record.propositionId === "string" &&
      typeof record.userId === "string" &&
      typeof record.author === "string" &&
      typeof record.handle === "string" &&
      typeof record.tone === "string" &&
      (record.optionIndex === null ||
        record.optionIndex === 0 ||
        record.optionIndex === 1) &&
      typeof record.body === "string" &&
      typeof record.likes === "number" &&
      typeof record.replyCount === "number" &&
      Array.isArray(record.repliesPreview) &&
      typeof record.createdAt === "string"
    );
  });
}

function buildAuthorLabel(userId: string): string {
  return `Arena ${userId.slice(-4)}`;
}

function buildHandle(userId: string): string {
  return `@${userId.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(-10)}`;
}

function buildTone(optionIndex: 0 | 1 | null): string {
  if (optionIndex === 0) {
    return "结算后观点";
  }

  if (optionIndex === 1) {
    return "结算后补充";
  }

  return "结算后讨论";
}

function formatMinutesAgo(createdAt: string): number {
  const differenceMs = Date.now() - Date.parse(createdAt);
  if (!Number.isFinite(differenceMs) || differenceMs <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(differenceMs / 60_000));
}

function formatTimeLabel(minutesAgo: number): string {
  if (minutesAgo <= 0) {
    return "刚刚";
  }

  return `${minutesAgo} 分钟前`;
}

function toCommentViewModel(
  comment: StoredDiscussionComment,
): ArenaDiscussionCommentViewModel {
  const minutesAgo = formatMinutesAgo(comment.createdAt);

  return {
    id: comment.id,
    marketId: comment.marketId,
    propositionId: comment.propositionId,
    userId: comment.userId,
    author: comment.author,
    handle: comment.handle,
    tone: comment.tone,
    timeLabel: formatTimeLabel(minutesAgo),
    minutesAgo,
    optionIndex: comment.optionIndex,
    body: comment.body,
    likes: comment.likes,
    replyCount: comment.replyCount,
    repliesPreview: structuredClone(comment.repliesPreview),
    createdAt: comment.createdAt,
  };
}

@Injectable()
export class DiscussionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly markets: MarketRepository,
    private readonly propositions: PropositionRepository,
  ) {}

  async getDiscussionThread(
    marketId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<ArenaDiscussionThreadViewModel> {
    const market = await this.markets.findById(marketId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${marketId} was not found`,
      );
    }

    const proposition = await this.propositions.findById(market.propositionId, db);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${market.propositionId} was not found`,
      );
    }

    if (proposition.status !== "settled") {
      return {
        marketId,
        propositionId: proposition.id,
        availability: "pre_settlement_hidden",
        totalCount: 0,
        comments: [],
      };
    }

    const record = await this.systemKeyValues.findByKey(
      this.buildStorageKey(marketId),
      db,
    );
    const storedComments = parseStoredComments(record?.valueJson ?? null)
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      );

    return {
      marketId,
      propositionId: proposition.id,
      availability: "settled",
      totalCount: storedComments.length,
      comments: storedComments.map(toCommentViewModel),
    };
  }

  async createDiscussionComment(
    input: CreateArenaDiscussionCommentInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<ArenaDiscussionThreadViewModel> {
    const market = await this.markets.findById(input.marketId, db);
    if (!market) {
      throw new ArenaNotFoundError(
        "market.not_found",
        `Market ${input.marketId} was not found`,
      );
    }

    if (market.propositionId !== input.propositionId) {
      throw new ArenaValidationError(
        "discussion.market_mismatch",
        "The selected market no longer matches this proposition",
      );
    }

    const proposition = await this.propositions.findById(input.propositionId, db);
    if (!proposition) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${input.propositionId} was not found`,
      );
    }

    if (proposition.status !== "settled") {
      throw new ArenaValidationError(
        "discussion.pre_settlement_hidden",
        "Arena only opens discussion after settlement so unresolved directional signals stay private",
      );
    }

    const body = input.body.trim();
    if (body.length === 0) {
      throw new ArenaValidationError(
        "discussion.empty_body",
        "Discussion comment body is required",
      );
    }

    const key = this.buildStorageKey(input.marketId);
    const existing = await this.systemKeyValues.findByKey(key, db);
    const currentComments = parseStoredComments(existing?.valueJson ?? null);
    const nextComment: StoredDiscussionComment = {
      id: this.ids.next("discussion_comment"),
      marketId: input.marketId,
      propositionId: input.propositionId,
      userId: input.userId,
      author: buildAuthorLabel(input.userId),
      handle: buildHandle(input.userId),
      tone: buildTone(input.optionIndex ?? null),
      optionIndex: input.optionIndex ?? null,
      body,
      likes: 0,
      replyCount: 0,
      repliesPreview: [],
      createdAt: input.createdAt,
    };
    const nextComments = [nextComment, ...currentComments].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );

    await this.systemKeyValues.upsertByKey(
      key,
      {
        id: this.ids.next("system_key_value"),
        key,
        description: `Arena discussion for market ${input.marketId}`,
        valueJson: cloneComments(nextComments) as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena discussion for market ${input.marketId}`,
        valueJson: cloneComments(nextComments) as unknown as Prisma.InputJsonValue,
      },
      db,
    );

    return this.getDiscussionThread(input.marketId, db);
  }

  private buildStorageKey(marketId: string): string {
    return `${DISCUSSION_NAMESPACE}.${marketId}`;
  }
}

