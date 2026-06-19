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

import {
  defaultDiscoveryRankingCategoryLabels,
  defaultDiscoveryRankingFilterLabels,
  displayCategoryByArenaCategory,
  discoveryDirectoryDefinitions,
  DiscoveryRankingCategoryId,
  filterMarketsForDiscoveryDirectory,
  getDiscoveryDirectoryDefinitionByPathname,
  getDiscoveryDirectoryDefinitionBySlug,
} from "../discovery-config.contract";
import type {
  InternalDiscoveryGlobalCategoryConfigViewModel,
  InternalDiscoveryGlobalConfigViewModel,
} from "../internal-ops.types";
import { DiscoveryConfigService } from "./discovery-config.service";
import { ValidationViewService } from "./validation-view.service";

const MAX_RANKING_ITEMS = 24;
const DISCOVER_FEATURED_LIMIT = 6;
const SPARKLINE_POINTS = 10;
const CLOSING_SOON_URGENT_WINDOW_MS = 3 * 60 * 60 * 1000;
const MAX_UPCOMING_CLOSING_SOON_ITEMS = 6;

type DiscoveryDisplayCategoryId = keyof typeof defaultDiscoveryRankingCategoryLabels;

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
  const categoryDisplay = defaultDiscoveryRankingCategoryLabels[displayCategoryId];
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
  rankingLabels: Record<string, string>,
): PublicDiscoveryCategoryViewModel[] => {
  const uniqueIds = [
    ...new Set(items.flatMap((item) => item.categoryIds)),
  ] as DiscoveryDisplayCategoryId[];

  return [
    {
      id: "all",
      label: rankingLabels.all ?? defaultDiscoveryRankingFilterLabels.all,
    },
    ...uniqueIds.map((id) => ({
      id,
      label:
        rankingLabels[id] ??
        defaultDiscoveryRankingFilterLabels[id] ??
        defaultDiscoveryRankingCategoryLabels[id].label,
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
  constructor(
    private readonly validationViews: ValidationViewService,
    private readonly discoveryConfig?: DiscoveryConfigService,
  ) {}

  async getCategoryDirectoryIndex(): Promise<PublicCategoryDirectoryIndexViewModel> {
    if (this.discoveryConfig) {
      return {
        items: await this.discoveryConfig.getPublicCategoryDirectoryIndexItems(),
      };
    }

    return {
      items: discoveryDirectoryDefinitions.map((config) => ({
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
    const globalConfig = this.discoveryConfig
      ? await this.discoveryConfig.getGlobalConfig()
      : null;
    const rankingLabels =
      globalConfig?.rankingCategoryLabels ?? defaultDiscoveryRankingFilterLabels;
    const directoryIndexItems = globalConfig
      ? this.toPublicDirectoryIndexItems(globalConfig)
      : discoveryDirectoryDefinitions.map((config) => ({
          slug: config.slug,
          pathname: config.pathname,
          label: config.label,
          title: config.title,
          directoryLabel: config.directoryLabel,
          description: config.description,
        }));
    const hotRanking = await this.buildRanking(markets, "hot", rankingLabels);
    const breakingRanking = await this.buildRanking(
      markets,
      "breaking",
      rankingLabels,
    );
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
      ...directoryIndexItems.map((config) => ({
        href: config.pathname,
        label: config.label,
        marketIds: getUniqueMarketIds(
          this.filterMarketsForDirectory(
            markets,
            this.resolveDirectoryContext(config.slug, globalConfig),
          ),
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
    const rankingLabels =
      this.discoveryConfig
        ? await this.discoveryConfig.getPublicRankingCategoryLabels()
        : defaultDiscoveryRankingFilterLabels;

    return this.buildRanking(markets, kind, rankingLabels);
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
    slugOrPathname: string,
  ): Promise<PublicCategoryDirectoryViewModel | null> {
    const markets = await this.validationViews.listMarkets();
    const globalConfig = this.discoveryConfig
      ? await this.discoveryConfig.getGlobalConfig()
      : null;
    const config = this.resolveDirectoryContext(slugOrPathname, globalConfig);
    if (!config || config.pageState !== "visible") {
      return null;
    }

    const filteredMarkets = this.filterMarketsForDirectory(
      markets,
      config,
    );
    const title = config.title;
    const configuredSidebarItems = this.discoveryConfig
      ? await this.discoveryConfig.getResolvedPublicSidebarItems(
          config.slug,
          filteredMarkets,
        )
      : null;

    return {
      title,
      sidebarItems: configuredSidebarItems ?? buildSidebarItems(filteredMarkets),
      featuredMarketId: filteredMarkets[0]?.marketId ?? null,
      marketIds: getUniqueMarketIds(filteredMarkets),
    };
  }

  private async buildRanking(
    markets: ValidationMarketViewModel[],
    kind: PublicDiscoveryRankingKind,
    rankingLabels: Record<string, string>,
  ): Promise<PublicDiscoveryRankingViewModel> {
    const orderedMarkets =
      kind === "hot"
        ? sortHotMarkets(markets)
        : sortBreakingMarkets(markets);
    const items = orderedMarkets
      .slice(0, MAX_RANKING_ITEMS)
      .map(toRankingItem);
    const categories = this.discoveryConfig
      ? await this.buildConfiguredRankingCategories(items, rankingLabels)
      : buildRankingCategories(items, rankingLabels);

    return {
      pageClassName: buildPageClassName(kind),
      heroVariant: kind,
      dateLabel: buildDateLabel(kind),
      title: buildRankingTitle(kind),
      description: buildRankingDescription(kind),
      categoryAriaLabel,
      listAriaLabel: `${buildRankingTitle(kind)} markets`,
      categories,
      items,
    };
  }

  private async buildConfiguredRankingCategories(
    items: PublicDiscoveryRankingItemViewModel[],
    rankingLabels: Record<string, string>,
  ): Promise<PublicDiscoveryCategoryViewModel[]> {
    const secondaryCapsules = this.discoveryConfig
      ? await this.discoveryConfig.getPublicSecondaryCapsules()
      : null;
    if (!secondaryCapsules) {
      return buildRankingCategories(items, rankingLabels);
    }

    const itemIds = new Set(items.map((item) => item.id));

    return secondaryCapsules
      .map((capsule) => {
        if (capsule.marketIds) {
          return {
            id: capsule.id,
            label: capsule.label,
            marketIds: capsule.marketIds.filter((marketId) =>
              itemIds.has(marketId),
            ),
          };
        }

        const systemCapsuleId = capsule.id as DiscoveryRankingCategoryId;
        if (
          systemCapsuleId !== "all" &&
          !items.some((item) => item.categoryIds.includes(systemCapsuleId))
        ) {
          return null;
        }

        return {
          id: systemCapsuleId,
          label:
            capsule.label ??
            rankingLabels[systemCapsuleId] ??
            defaultDiscoveryRankingFilterLabels[systemCapsuleId] ??
            systemCapsuleId,
        };
      })
      .filter((entry) => entry !== null) as PublicDiscoveryCategoryViewModel[];
  }

  private toPublicDirectoryIndexItems(
    globalConfig: InternalDiscoveryGlobalConfigViewModel,
  ): PublicCategoryDirectoryIndexViewModel["items"] {
    return globalConfig.categories
      .filter((category) => category.pageState === "visible")
      .map((category) => ({
        slug: category.slug,
        pathname: category.pathname,
        label: category.label,
        title: category.title,
        directoryLabel: category.directoryLabel,
        description: category.description,
      }));
  }

  private resolveDirectoryContext(
    slugOrPathname: string,
    globalConfig: InternalDiscoveryGlobalConfigViewModel | null,
  ): InternalDiscoveryGlobalCategoryConfigViewModel | null {
    const normalized = slugOrPathname.trim();

    if (globalConfig) {
      const configuredCategory =
        globalConfig.categories.find(
          (item) => item.slug === normalized || item.pathname === normalized,
        ) ?? null;
      if (configuredCategory) {
        return configuredCategory;
      }
    }

    const definition =
      getDiscoveryDirectoryDefinitionByPathname(normalized) ??
      getDiscoveryDirectoryDefinitionBySlug(normalized);
    if (!definition) {
      return null;
    }

    return {
      slug: definition.slug,
      pathname: definition.pathname,
      label: definition.label,
      title: definition.title,
      directoryLabel: definition.directoryLabel,
      description: definition.description,
      displayOrder: 0,
      pageState: "visible",
      kind: "system",
      marketIdWhitelist: [],
      invalidMarketIds: [],
    };
  }

  private filterMarketsForDirectory(
    markets: ValidationMarketViewModel[],
    config: InternalDiscoveryGlobalCategoryConfigViewModel | null,
  ): ValidationMarketViewModel[] {
    if (!config || config.pageState !== "visible") {
      return [];
    }

    const orderedMarkets = config.kind === "custom"
      ? markets.filter((market) => config.marketIdWhitelist.includes(market.marketId))
      : filterMarketsForDiscoveryDirectory(markets, config.pathname);

    return orderedMarkets.sort(compareByRecency);
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
        label:
          defaultDiscoveryRankingCategoryLabels[categoryId].label,
        marketIds: getUniqueMarketIds(
          orderedByRecency.filter(
            (market) => toDisplayCategoryId(market) === categoryId,
          ),
        ),
      })),
    ].filter((item) => item.marketIds.length > 0);

    return { items };
  }

}
