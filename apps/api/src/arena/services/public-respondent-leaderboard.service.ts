import { Injectable } from "@nestjs/common";
import type {
  Proposition,
  PropositionCategory,
  ResponseReviewStatus,
  UserTag,
} from "@prisma/client";
import type {
  PublicRespondentLeaderboardCategoryViewModel,
  PublicRespondentLeaderboardRowViewModel,
  PublicRespondentLeaderboardViewModel,
  RespondentAccountPreferencesViewModel,
} from "@arena/shared";

import { PropositionRepository } from "../repositories/proposition.repository";
import { DispatchTaskRepository } from "../repositories/dispatch-task.repository";
import { ResponseRepository } from "../repositories/response.repository";
import { ResponseReviewRepository } from "../repositories/response-review.repository";
import { UserReputationRepository } from "../repositories/user-reputation.repository";
import { UserTagRepository } from "../repositories/user-tag.repository";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { ArenaUserRepository } from "../repositories/arena-user.repository";
import { AccountPreferencesService } from "./account-preferences.service";

type LeaderboardCategoryConfig = {
  id: string;
  label: string;
  description: string;
  categories: PropositionCategory[];
};

type EligibleUserAggregate = {
  userId: string;
  reviewedCount: number;
  acceptedCount: number;
  responseRatePercent: number;
  reputationScore: number;
  topTag: string;
  publicWalletAddress: string | null;
};

type ReviewAggregateBucket = {
  reviewedCount: number;
  acceptedCount: number;
};

type PropositionRecord = Proposition;

const ACCOUNT_PREFERENCES_KEY_PREFIX = "arena.account.preferences.";
const CLOSED_TASK_STATUSES = new Set([
  "submitted",
  "skipped",
  "expired",
  "cancelled",
]);
const ACCEPTED_REVIEW_STATUSES = new Set<ResponseReviewStatus>([
  "valid",
  "partial_valid",
]);
const FINALIZED_REVIEW_STATUSES = new Set<ResponseReviewStatus>([
  "valid",
  "partial_valid",
  "invalid",
  "fraud_suspected",
]);

const LEADERBOARD_CATEGORIES: LeaderboardCategoryConfig[] = [
  {
    id: "dao",
    label: "DAO",
    description: "DAO 治理、国库、委托与协议研究命题的回答率排行。",
    categories: ["dao"],
  },
  {
    id: "public-policy",
    label: "公共政策",
    description: "公共政策、公共服务、舆情类命题的回答率排行。",
    categories: ["politics"],
  },
  {
    id: "ai-research",
    label: "AI 调研",
    description: "AI 工具链、模型调研、开发者工作流类命题的回答率排行。",
    categories: ["ai"],
  },
  {
    id: "geopolitics",
    label: "地缘事件",
    description: "地缘动态、跨境观察类命题的回答率排行。",
    categories: ["general", "politics"],
  },
  {
    id: "finance",
    label: "金融观察",
    description: "宏观金融、市场动态、价格趋势类命题的回答率排行。",
    categories: ["brand_research", "general"],
  },
  {
    id: "sports",
    label: "体育结果",
    description: "体育赛事、赛季积分、赛前共识类命题的回答率排行。",
    categories: ["sports"],
  },
];

const TAG_LABELS: Record<string, string> = {
  high_completion: "高完成率",
  high_quality: "高质检通过",
  low_anomaly: "低异常率",
  stable_responder: "稳定应答",
  interested_in_sports: "体育观察",
  interested_in_dao: "DAO 研究",
  interested_in_ai: "AI 调研",
  interested_in_brand_research: "品牌研究",
  interested_in_politics: "公共政策",
  interested_in_entertainment: "文化观察",
};

function isPubliclyIndexable(
  preferences: RespondentAccountPreferencesViewModel,
): boolean {
  return (
    preferences.profile.profileVisibility === "public" &&
    preferences.privacy.allowActivityIndexing === true
  );
}

function buildHandle(userId: string): string {
  const normalized = userId.toLowerCase();
  return `respondent-${normalized.slice(-4)}`;
}

function buildWalletShort(userId: string): string {
  const normalized = userId.toLowerCase();
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`;
}

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/u.test(value);
}

function buildPublicIdentity(
  userId: string,
  publicWalletAddress: string | null,
): Pick<PublicRespondentLeaderboardRowViewModel, "handle" | "walletShort"> | null {
  const walletAddress =
    typeof publicWalletAddress === "string" &&
    isWalletAddress(publicWalletAddress)
      ? publicWalletAddress.toLowerCase()
      : isWalletAddress(userId)
        ? userId.toLowerCase()
        : null;

  if (!walletAddress) {
    return null;
  }

  return {
    handle: buildHandle(walletAddress),
    walletShort: buildWalletShort(walletAddress),
  };
}

function pickTopTag(tags: UserTag[]): string {
  const currentTag = tags.find((tag) => tag.tagKey !== "risky_responder");
  if (!currentTag) {
    return "公开应答";
  }

  return TAG_LABELS[currentTag.tagKey] ?? currentTag.tagKey.replaceAll("_", " ");
}

function sortRows(
  left: PublicRespondentLeaderboardRowViewModel,
  right: PublicRespondentLeaderboardRowViewModel,
): number {
  if (right.responseRatePercent !== left.responseRatePercent) {
    return right.responseRatePercent - left.responseRatePercent;
  }

  if (right.acceptedCount !== left.acceptedCount) {
    return right.acceptedCount - left.acceptedCount;
  }

  if (right.reviewedCount !== left.reviewedCount) {
    return right.reviewedCount - left.reviewedCount;
  }

  if (right.reputationScore !== left.reputationScore) {
    return right.reputationScore - left.reputationScore;
  }

  if (left.handle !== right.handle) {
    return left.handle.localeCompare(right.handle);
  }

  return left.walletShort.localeCompare(right.walletShort);
}

@Injectable()
export class PublicRespondentLeaderboardService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly tasks: DispatchTaskRepository,
    private readonly responses: ResponseRepository,
    private readonly reviews: ResponseReviewRepository,
    private readonly reputations: UserReputationRepository,
    private readonly tags: UserTagRepository,
    private readonly accountPreferences: AccountPreferencesService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly users: ArenaUserRepository,
  ) {}

  async getLeaderboard(): Promise<PublicRespondentLeaderboardViewModel> {
    const eligibleUserIds = await this.listEligibleUserIds();
    if (eligibleUserIds.length === 0) {
      return {
        categories: LEADERBOARD_CATEGORIES.map((category) => ({
          id: category.id,
          label: category.label,
          description: category.description,
          rows: [],
        })),
      };
    }

    const propositions = await this.propositions.list({ marketEnabled: true });
    const users = await this.users.findByIds(eligibleUserIds);
    const walletByUserId = new Map(
      users.map((user) => [user.id, user.primaryWalletAddress ?? null] as const),
    );
    const propositionById = new Map(
      propositions.map((proposition) => [proposition.id, proposition] as const),
    );
    const categoryBuckets = new Map<string, Set<PropositionCategory>>(
      LEADERBOARD_CATEGORIES.map((category) => [
        category.id,
        new Set(category.categories),
      ]),
    );

    const categories = await Promise.all(
      LEADERBOARD_CATEGORIES.map(async (category) => {
        const rows = await Promise.all(
          eligibleUserIds.map(async (userId) => {
            const aggregate = await this.buildUserCategoryAggregate(
              userId,
              categoryBuckets.get(category.id) ?? new Set(),
              propositionById,
              walletByUserId.get(userId) ?? null,
            );
            if (!aggregate || aggregate.reviewedCount === 0) {
              return null;
            }

            return this.toRowViewModel(aggregate);
          }),
        );

        const sortedRows = rows
          .filter(
            (
              row,
            ): row is PublicRespondentLeaderboardRowViewModel => row !== null,
          )
          .sort(sortRows);

        return {
          id: category.id,
          label: category.label,
          description: category.description,
          rows: sortedRows,
        } satisfies PublicRespondentLeaderboardCategoryViewModel;
      }),
    );

    return {
      categories,
    };
  }

  private async listEligibleUserIds(): Promise<string[]> {
    const records = await this.systemKeyValues.listByKeyPrefix(
      ACCOUNT_PREFERENCES_KEY_PREFIX,
    );

    const eligible: string[] = [];
    for (const record of records) {
      const userId = record.key.slice(ACCOUNT_PREFERENCES_KEY_PREFIX.length);
      if (!userId) {
        continue;
      }

      const preferences =
        await this.accountPreferences.getAccountPreferencesForUser(userId);
      if (isPubliclyIndexable(preferences)) {
        eligible.push(userId);
      }
    }

    return eligible;
  }

  private async buildUserCategoryAggregate(
    userId: string,
    categoryFilter: Set<PropositionCategory>,
    propositionById: Map<string, PropositionRecord>,
    publicWalletAddress: string | null,
  ): Promise<EligibleUserAggregate | null> {
    const [tasks, latestResponses, finalizedReviews, reputation, tags] =
      await Promise.all([
        this.tasks.listByUser(userId),
        this.responses.listLatestByUser(userId),
        this.reviews.listFinalizedByUserId(userId),
        this.reputations.findByUserId(userId),
        this.tags.listCurrentByUser(userId),
      ]);

    const latestResponseIds = new Set(latestResponses.map((response) => response.id));

    const reviewBucket = finalizedReviews.reduce<ReviewAggregateBucket>(
      (aggregate, review) => {
        if (!FINALIZED_REVIEW_STATUSES.has(review.status)) {
          return aggregate;
        }

        if (!latestResponseIds.has(review.responseId)) {
          return aggregate;
        }

        const response = latestResponses.find(
          (entry) => entry.id === review.responseId,
        );
        if (!response) {
          return aggregate;
        }

        const proposition = propositionById.get(response.propositionId);
        if (!proposition || !categoryFilter.has(proposition.category)) {
          return aggregate;
        }

        return {
          reviewedCount: aggregate.reviewedCount + 1,
          acceptedCount:
            aggregate.acceptedCount +
            (ACCEPTED_REVIEW_STATUSES.has(review.status) ? 1 : 0),
        };
      },
      {
        reviewedCount: 0,
        acceptedCount: 0,
      },
    );

    if (reviewBucket.reviewedCount === 0) {
      return null;
    }

    const closedTaskCount = tasks.filter((task) => {
      if (!CLOSED_TASK_STATUSES.has(task.status)) {
        return false;
      }

      const proposition = propositionById.get(task.propositionId);
      return proposition ? categoryFilter.has(proposition.category) : false;
    }).length;

    return {
      userId,
      reviewedCount: reviewBucket.reviewedCount,
      acceptedCount: reviewBucket.acceptedCount,
      responseRatePercent:
        closedTaskCount === 0
          ? 100
          : Math.round((reviewBucket.reviewedCount / closedTaskCount) * 1000) /
            10,
      reputationScore: reputation?.reputationScore ?? 0,
      topTag: pickTopTag(tags),
      publicWalletAddress,
    };
  }

  private toRowViewModel(
    aggregate: EligibleUserAggregate,
  ): PublicRespondentLeaderboardRowViewModel | null {
    const publicIdentity = buildPublicIdentity(
      aggregate.userId,
      aggregate.publicWalletAddress,
    );

    if (!publicIdentity) {
      return null;
    }

    return {
      handle: publicIdentity.handle,
      walletShort: publicIdentity.walletShort,
      responseRatePercent: aggregate.responseRatePercent,
      reviewedCount: aggregate.reviewedCount,
      acceptedCount: aggregate.acceptedCount,
      reputationScore: aggregate.reputationScore,
      topTag: aggregate.topTag,
    };
  }
}
