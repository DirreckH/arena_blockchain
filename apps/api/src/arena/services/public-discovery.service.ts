import { Injectable } from "@nestjs/common";
import type {
  PublicCategoryDirectoryViewModel,
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
  pathname: string;
  label: string;
  title: string;
  marketFilter: (market: ValidationMarketViewModel) => boolean;
};

const MAX_RANKING_ITEMS = 24;
const DISCOVER_FEATURED_LIMIT = 6;
const SPARKLINE_POINTS = 10;

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
    pathname: "/zh/politics",
    label: "Politics",
    title: "Politics",
    marketFilter: (market) => market.category === "politics",
  },
  {
    pathname: "/zh/sports/live",
    label: "Sports",
    title: "Sports",
    marketFilter: (market) => market.category === "sports",
  },
  {
    pathname: "/zh/crypto",
    label: "Crypto",
    title: "Crypto",
    marketFilter: (market) => market.category === "ai",
  },
  {
    pathname: "/zh/tech",
    label: "Tech",
    title: "Tech",
    marketFilter: (market) => market.category === "ai",
  },
  {
    pathname: "/zh/geopolitics",
    label: "Geopolitics",
    title: "Geopolitics",
    marketFilter: (market) =>
      market.category === "politics" || market.category === "general",
  },
  {
    pathname: "/zh/finance",
    label: "Finance",
    title: "Finance",
    marketFilter: (market) =>
      market.category === "brand_research" || market.category === "general",
  },
  {
    pathname: "/zh/pop-culture",
    label: "Culture",
    title: "Culture",
    marketFilter: (market) => market.category === "entertainment",
  },
  {
    pathname: "/zh/economy",
    label: "Economy",
    title: "Economy",
    marketFilter: (market) =>
      market.category === "brand_research" || market.category === "general",
  },
  {
    pathname: "/zh/weather",
    label: "Weather",
    title: "Weather",
    marketFilter: (market) => market.category === "general",
  },
  {
    pathname: "/zh/surveys",
    label: "Surveys",
    title: "Surveys",
    marketFilter: (market) => market.category === "brand_research",
  },
  {
    pathname: "/zh/rolling",
    label: "Rolling",
    title: "Rolling",
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
