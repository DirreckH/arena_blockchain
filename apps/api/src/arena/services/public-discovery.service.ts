import { Injectable } from "@nestjs/common";
import type {
  PublicCategoryDirectoryViewModel,
  PublicCategoryDirectoryIndexViewModel,
  PublicClosingSoonItemViewModel,
  PublicClosingSoonViewModel,
  PublicDiscoverPageSectionViewModel,
  PublicDiscoverPageViewModel,
  PublicDiscoveryCategoryViewModel,
  PublicDiscoveryRankingItemViewModel,
  PublicDiscoveryRankingKind,
  PublicDiscoveryRankingViewModel,
  PublicLatestTopicItemViewModel,
  PublicLatestTopicsViewModel,
  ValidationMarketViewModel,
} from "@arena/shared";

import { ValidationViewService } from "./validation-view.service";

type DiscoveryDisplayCategoryId =
  | "general"
  | "politics"
  | "sports"
  | "tech"
  | "research"
  | "culture";

type DirectoryConfig = {
  slug: string;
  pathname: string;
  label: string;
  title: string;
  directoryLabel: string;
  description: string;
  marketFilter: (market: ValidationMarketViewModel) => boolean;
};

const MAX_RANKING_ITEMS = 24;
const DISCOVER_FEATURED_LIMIT = 6;
const SPARKLINE_POINTS = 10;
const CLOSING_SOON_URGENT_WINDOW_MS = 3 * 60 * 60 * 1000;
const MAX_UPCOMING_CLOSING_SOON_ITEMS = 6;

const displayCategoryByArenaCategory: Record<
  ValidationMarketViewModel["category"],
  DiscoveryDisplayCategoryId
> = {
  general: "general",
  politics: "politics",
  sports: "sports",
  ai: "tech",
  brand_research: "research",
  entertainment: "culture",
};

const displayCategoryLabels: Record<
  DiscoveryDisplayCategoryId,
  { label: string; tile: string }
> = {
  general: { label: "General", tile: "GEN" },
  politics: { label: "Politics", tile: "POL" },
  sports: { label: "Sports", tile: "SPT" },
  tech: { label: "Tech", tile: "AI" },
  research: { label: "Research", tile: "RSH" },
  culture: { label: "Culture", tile: "CUL" },
};

const directoryConfigs: DirectoryConfig[] = [
  {
    slug: "politics",
    pathname: "/zh/politics",
    label: "公共政策",
    title: "政治",
    directoryLabel: "公共政策",
    description: "政府、立法与公共治理",
    marketFilter: (market) => market.category === "politics",
  },
  {
    slug: "sports-live",
    pathname: "/zh/sports/live",
    label: "体育",
    title: "体育",
    directoryLabel: "体育结果",
    description: "赛事结果与运动员表现",
    marketFilter: (market) => market.category === "sports",
  },
  {
    slug: "crypto",
    pathname: "/zh/crypto",
    label: "加密",
    title: "加密",
    directoryLabel: "加密观察",
    description: "区块链与数字资产市场",
    marketFilter: (market) => market.category === "ai",
  },
  {
    slug: "tech",
    pathname: "/zh/tech",
    label: "科技",
    title: "科技",
    directoryLabel: "科技调研",
    description: "产品、开发者与科技生态",
    marketFilter: (market) => market.category === "ai",
  },
  {
    slug: "geopolitics",
    pathname: "/zh/geopolitics",
    label: "地缘",
    title: "地缘",
    directoryLabel: "地缘事件",
    description: "国际局势与区域冲突",
    marketFilter: (market) =>
      market.category === "politics" || market.category === "general",
  },
  {
    slug: "finance",
    pathname: "/zh/finance",
    label: "金融",
    title: "金融",
    directoryLabel: "金融观察",
    description: "资产价格与宏观经济",
    marketFilter: (market) =>
      market.category === "brand_research" || market.category === "general",
  },
  {
    slug: "pop-culture",
    pathname: "/zh/pop-culture",
    label: "文化",
    title: "文化",
    directoryLabel: "文化调研",
    description: "娱乐、媒体与大众文化",
    marketFilter: (market) => market.category === "entertainment",
  },
  {
    slug: "economy",
    pathname: "/zh/economy",
    label: "经济",
    title: "经济",
    directoryLabel: "经济观察",
    description: "就业、消费与产业数据",
    marketFilter: (market) =>
      market.category === "brand_research" || market.category === "general",
  },
  {
    slug: "weather",
    pathname: "/zh/weather",
    label: "天气",
    title: "天气",
    directoryLabel: "天气滚动命题",
    description: "天气与滚动观察命题",
    marketFilter: (market) => market.category === "general",
  },
  {
    slug: "surveys",
    pathname: "/zh/surveys",
    label: "调研",
    title: "调研",
    directoryLabel: "调研网络",
    description: "开发者、消费者与品牌调研",
    marketFilter: (market) => market.category === "brand_research",
  },
  {
    slug: "rolling",
    pathname: "/zh/rolling",
    label: "滚动命题",
    title: "滚动命题",
    directoryLabel: "滚动命题",
    description: "周期更新与上期结果归档",
    marketFilter: (market) => market.category === "general",
  },
];

const categoryAriaLabel = "Discovery ranking categories";
const hotDescription =
  "Markets ordered by public sample completion and active participation progress.";
const breakingDescription =
  "Markets ordered by recency and public lifecycle activity.";

const getUniqueMarketIds = (markets: ValidationMarketViewModel[]): string[] =>
  [...new Set(markets.map((market) => market.marketId))];

const parseIsoTime = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const resolveClosingSoonRevealAt = (
  market: ValidationMarketViewModel,
): string | null =>
  market.publicProgress.timing.deadlineAt ??
  market.publicProgress.timing.minDurationEndsAt ??
  market.bettingClosesAt ??
  null;

const toClosingSoonItem = (
  market: ValidationMarketViewModel,
  referenceNowMs: number,
): PublicClosingSoonItemViewModel | null => {
  if (market.publicProgress.publicState.phase === "settled") {
    return null;
  }

  const revealAt = resolveClosingSoonRevealAt(market);
  const revealAtMs = parseIsoTime(revealAt);
  if (revealAtMs <= 0) {
    return null;
  }

  const differenceMs = revealAtMs - referenceNowMs;
  if (differenceMs <= 0) {
    return null;
  }

  return {
    marketId: market.marketId,
    revealAt,
    differenceMs,
  };
};

const compareByRecency = (
  left: ValidationMarketViewModel,
  right: ValidationMarketViewModel,
): number => {
  const leftTimestamp = Math.max(
    parseIsoTime(left.publicProgress.timing.settledAt),
    parseIsoTime(left.publicProgress.timing.revealStartedAt),
    parseIsoTime(left.publicProgress.timing.frozenAt),
    parseIsoTime(left.publicProgress.timing.startedAt),
  );
  const rightTimestamp = Math.max(
    parseIsoTime(right.publicProgress.timing.settledAt),
    parseIsoTime(right.publicProgress.timing.revealStartedAt),
    parseIsoTime(right.publicProgress.timing.frozenAt),
    parseIsoTime(right.publicProgress.timing.startedAt),
  );

  return rightTimestamp - leftTimestamp;
};

const phaseRank = (market: ValidationMarketViewModel): number => {
  switch (market.publicProgress.publicState.phase) {
    case "settled":
      return 5;
    case "revealing":
      return 4;
    case "frozen":
      return 3;
    case "live":
      return 2;
    case "scheduled":
    default:
      return 1;
  }
};

const buildSparkline = (score: number): number[] =>
  Array.from({ length: SPARKLINE_POINTS }, () => score);

const buildDateLabel = (kind: PublicDiscoveryRankingKind): string => {
  if (kind === "hot") {
    return "Public activity";
  }

  return `As of ${new Date().toISOString().slice(0, 10)}`;
};

const buildRankingTitle = (kind: PublicDiscoveryRankingKind): string =>
  kind === "hot" ? "Hot" : "Breaking";

const buildRankingDescription = (kind: PublicDiscoveryRankingKind): string =>
  kind === "hot" ? hotDescription : breakingDescription;

const buildPageClassName = (kind: PublicDiscoveryRankingKind): string =>
  kind === "hot" ? "hot-page" : "breaking-page-shell";

const marketScore = (market: ValidationMarketViewModel): number =>
  market.publicProgress.progress.progressPercent;

const marketChange = (): number => 0;

const sortHotMarkets = (markets: ValidationMarketViewModel[]) =>
  [...markets].sort((left, right) => {
    const progressDelta =
      right.publicProgress.progress.progressPercent -
      left.publicProgress.progress.progressPercent;
    if (progressDelta !== 0) {
      return progressDelta;
    }

    const sampleDelta =
      right.publicProgress.progress.currentEffectiveSample -
      left.publicProgress.progress.currentEffectiveSample;
    if (sampleDelta !== 0) {
      return sampleDelta;
    }

    const phaseDelta = phaseRank(right) - phaseRank(left);
    if (phaseDelta !== 0) {
      return phaseDelta;
    }

    return compareByRecency(left, right);
  });

const sortBreakingMarkets = (markets: ValidationMarketViewModel[]) =>
  [...markets].sort((left, right) => {
    const phaseDelta = phaseRank(right) - phaseRank(left);
    if (phaseDelta !== 0) {
      return phaseDelta;
    }

    const recencyDelta = compareByRecency(left, right);
    if (recencyDelta !== 0) {
      return recencyDelta;
    }

    const timeDelta = right.timeProgressPercent - left.timeProgressPercent;
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return (
      right.publicProgress.progress.currentEffectiveSample -
      left.publicProgress.progress.currentEffectiveSample
    );
  });

const toDisplayCategoryId = (
  market: ValidationMarketViewModel,
): DiscoveryDisplayCategoryId =>
  displayCategoryByArenaCategory[market.category];

const toRankingItem = (
  market: ValidationMarketViewModel,
): PublicDiscoveryRankingItemViewModel => {
  const displayCategoryId = toDisplayCategoryId(market);
  const categoryDisplay = displayCategoryLabels[displayCategoryId];
  const score = marketScore(market);

  return {
    id: market.marketId,
    href: `/zh/event/${market.marketId}`,
    title: market.title,
    score,
    change: marketChange(),
    categoryIds: [displayCategoryId],
    sparkline: buildSparkline(score),
    tileLabel: categoryDisplay.tile,
    tileTone: displayCategoryId === "sports" ? "f1" : "neutral",
    isVerified:
      market.publicProgress.publicState.phase === "revealing" ||
      market.publicProgress.publicState.phase === "settled",
  };
};

const buildRankingCategories = (
  items: PublicDiscoveryRankingItemViewModel[],
): PublicDiscoveryCategoryViewModel[] => {
  const uniqueIds = [
    ...new Set(items.flatMap((item) => item.categoryIds)),
  ] as DiscoveryDisplayCategoryId[];

  return [
    {
      id: "all",
      label: "All",
    },
    ...uniqueIds.map((id) => ({
      id,
      label: displayCategoryLabels[id].label,
    })),
  ];
};

const buildSidebarItems = (
  markets: ValidationMarketViewModel[],
): PublicCategoryDirectoryViewModel["sidebarItems"] => {
  const collectingCount = markets.filter(
    (market) => market.publicProgress.publicState.phase === "live",
  ).length;
  const readyCount = markets.filter(
    (market) =>
      market.publicProgress.publicState.phase === "live" &&
      market.publicProgress.publicState.reachedSampleThreshold,
  ).length;
  const frozenCount = markets.filter(
    (market) => market.publicProgress.publicState.phase === "frozen",
  ).length;
  const revealingCount = markets.filter(
    (market) => market.publicProgress.publicState.phase === "revealing",
  ).length;
  const settledCount = markets.filter(
    (market) => market.publicProgress.publicState.phase === "settled",
  ).length;

  return [
    { label: "All", count: String(markets.length) },
    { label: "Collecting", count: String(collectingCount) },
    { label: "Ready", count: String(readyCount) },
    { label: "Frozen", count: String(frozenCount) },
    { label: "Revealing", count: String(revealingCount) },
    { label: "Settled", count: String(settledCount) },
  ];
};

@Injectable()
export class PublicDiscoveryService {
  constructor(private readonly validationViews: ValidationViewService) {}

  async getCategoryDirectoryIndex(): Promise<PublicCategoryDirectoryIndexViewModel> {
    return {
      items: directoryConfigs.map((config) => ({
        slug: config.slug,
        pathname: config.pathname,
        label: config.label,
        title: config.title,
        directoryLabel: config.directoryLabel,
        description: config.description,
      })),
    };
  }

  async getHome(): Promise<PublicDiscoverPageViewModel> {
    const markets = await this.validationViews.listMarkets();
    const hotRanking = this.buildRanking(markets, "hot");
    const breakingRanking = this.buildRanking(markets, "breaking");
    const latestTopics = this.buildLatestTopics(markets);

    const sections: PublicDiscoverPageSectionViewModel[] = [
      {
        href: "/zh",
        label: "Hot",
        marketIds: hotRanking.items.map((item) => item.id),
        moreHref: "/zh/markets",
      },
      {
        href: "/zh/breaking",
        label: "Breaking",
        marketIds: breakingRanking.items.map((item) => item.id),
        moreHref: "/zh/breaking",
      },
      {
        href: "/zh/new",
        label: "Latest",
        marketIds: latestTopics.items[0]?.marketIds ?? [],
        moreHref: "/zh/new",
      },
      ...directoryConfigs.map((config) => ({
        href: config.pathname,
        label: config.label,
        marketIds: getUniqueMarketIds(
          this.filterMarketsForDirectory(markets, config.pathname),
        ),
        moreHref: config.pathname,
      })),
    ];

    return {
      featuredMarketIds: hotRanking.items
        .slice(0, DISCOVER_FEATURED_LIMIT)
        .map((item) => item.id),
      sections,
    };
  }

  async getRanking(
    kind: PublicDiscoveryRankingKind,
  ): Promise<PublicDiscoveryRankingViewModel> {
    const markets = await this.validationViews.listMarkets();
    return this.buildRanking(markets, kind);
  }

  async getLatestTopics(): Promise<PublicLatestTopicsViewModel> {
    const markets = await this.validationViews.listMarkets();
    return this.buildLatestTopics(markets);
  }

  async getClosingSoon(): Promise<PublicClosingSoonViewModel> {
    const generatedAt = new Date().toISOString();
    const referenceNowMs = Date.parse(generatedAt);
    const orderedItems = (await this.validationViews.listMarkets())
      .map((market) => toClosingSoonItem(market, referenceNowMs))
      .filter(
        (item): item is PublicClosingSoonItemViewModel => item !== null,
      )
      .sort((left, right) => left.differenceMs - right.differenceMs);

    return {
      generatedAt,
      urgentWindowMs: CLOSING_SOON_URGENT_WINDOW_MS,
      urgent: orderedItems.filter(
        (item) => item.differenceMs <= CLOSING_SOON_URGENT_WINDOW_MS,
      ),
      upcoming: orderedItems
        .filter((item) => item.differenceMs > CLOSING_SOON_URGENT_WINDOW_MS)
        .slice(0, MAX_UPCOMING_CLOSING_SOON_ITEMS),
    };
  }

  async getCategoryDirectory(
    pathname: string,
  ): Promise<PublicCategoryDirectoryViewModel | null> {
    const config = directoryConfigs.find((item) => item.pathname === pathname);
    if (!config) {
      return null;
    }

    const markets = this.filterMarketsForDirectory(
      await this.validationViews.listMarkets(),
      pathname,
    );

    return {
      title: config.title,
      sidebarItems: buildSidebarItems(markets),
      featuredMarketId: markets[0]?.marketId ?? null,
      marketIds: getUniqueMarketIds(markets),
    };
  }

  private buildRanking(
    markets: ValidationMarketViewModel[],
    kind: PublicDiscoveryRankingKind,
  ): PublicDiscoveryRankingViewModel {
    const orderedMarkets =
      kind === "hot"
        ? sortHotMarkets(markets)
        : sortBreakingMarkets(markets);
    const items = orderedMarkets
      .slice(0, MAX_RANKING_ITEMS)
      .map(toRankingItem);

    return {
      pageClassName: buildPageClassName(kind),
      heroVariant: kind,
      dateLabel: buildDateLabel(kind),
      title: buildRankingTitle(kind),
      description: buildRankingDescription(kind),
      categoryAriaLabel,
      listAriaLabel: `${buildRankingTitle(kind)} markets`,
      categories: buildRankingCategories(items),
      items,
    };
  }

  private buildLatestTopics(
    markets: ValidationMarketViewModel[],
  ): PublicLatestTopicsViewModel {
    const orderedByRecency = [...markets].sort(compareByRecency);
    const liveMarkets = orderedByRecency.filter(
      (market) => market.publicProgress.publicState.phase === "live",
    );
    const readyMarkets = orderedByRecency.filter(
      (market) =>
        market.publicProgress.publicState.phase === "live" &&
        market.publicProgress.publicState.reachedSampleThreshold,
    );
    const revealingMarkets = orderedByRecency.filter(
      (market) =>
        market.publicProgress.publicState.phase === "frozen" ||
        market.publicProgress.publicState.phase === "revealing",
    );
    const settledMarkets = orderedByRecency.filter(
      (market) => market.publicProgress.publicState.phase === "settled",
    );

    const items: PublicLatestTopicItemViewModel[] = [
      {
        id: "latest",
        label: "Latest",
        marketIds: getUniqueMarketIds(orderedByRecency),
      },
      {
        id: "live",
        label: "Live",
        marketIds: getUniqueMarketIds(liveMarkets),
      },
      {
        id: "ready",
        label: "Ready",
        marketIds: getUniqueMarketIds(readyMarkets),
      },
      {
        id: "revealing",
        label: "Revealing",
        marketIds: getUniqueMarketIds(revealingMarkets),
      },
      {
        id: "settled",
        label: "Settled",
        marketIds: getUniqueMarketIds(settledMarkets),
      },
      ...(
        [
          "politics",
          "sports",
          "tech",
          "research",
          "culture",
          "general",
        ] as DiscoveryDisplayCategoryId[]
      ).map((categoryId) => ({
        id: categoryId,
        label: displayCategoryLabels[categoryId].label,
        marketIds: getUniqueMarketIds(
          orderedByRecency.filter(
            (market) => toDisplayCategoryId(market) === categoryId,
          ),
        ),
      })),
    ].filter((item) => item.marketIds.length > 0);

    return { items };
  }

  private filterMarketsForDirectory(
    markets: ValidationMarketViewModel[],
    pathname: string,
  ): ValidationMarketViewModel[] {
    const config = directoryConfigs.find((item) => item.pathname === pathname);
    if (!config) {
      return [];
    }

    return markets.filter(config.marketFilter).sort(compareByRecency);
  }
}
