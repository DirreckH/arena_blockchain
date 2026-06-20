import type {
  PublicCategoryDirectoryIndexItemViewModel,
  ValidationMarketViewModel,
} from "@arena/shared";

export type DiscoveryRankingCategoryId =
  | "all"
  | "general"
  | "dao"
  | "politics"
  | "sports"
  | "tech"
  | "research"
  | "culture";

export type DiscoveryDisplayCategoryId = Exclude<
  DiscoveryRankingCategoryId,
  "all"
>;

export type DiscoveryDirectoryDefinition = {
  slug: string;
  pathname: string;
  label: string;
  title: string;
  directoryLabel: string;
  description: string;
  marketFilter: (market: ValidationMarketViewModel) => boolean;
};

export const DISCOVERY_RANKING_CATEGORY_IDS: DiscoveryRankingCategoryId[] = [
  "all",
  "general",
  "dao",
  "politics",
  "sports",
  "tech",
  "research",
  "culture",
];

export const CUSTOM_DIRECTORY_PATHNAME_PREFIX = "/zh/c/";
export const CUSTOM_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export const displayCategoryByArenaCategory: Record<
  ValidationMarketViewModel["category"],
  DiscoveryDisplayCategoryId
> = {
  general: "general",
  dao: "dao",
  politics: "politics",
  sports: "sports",
  ai: "tech",
  brand_research: "research",
  entertainment: "culture",
};

export const defaultDiscoveryRankingCategoryLabels: Record<
  DiscoveryDisplayCategoryId,
  { label: string; tile: string }
> = {
  general: { label: "General", tile: "GEN" },
  dao: { label: "DAO", tile: "DAO" },
  politics: { label: "Politics", tile: "POL" },
  sports: { label: "Sports", tile: "SPT" },
  tech: { label: "Tech", tile: "AI" },
  research: { label: "Research", tile: "RSH" },
  culture: { label: "Culture", tile: "CUL" },
};

export const defaultDiscoveryRankingFilterLabels: Record<
  DiscoveryRankingCategoryId,
  string
> = {
  all: "All",
  general: defaultDiscoveryRankingCategoryLabels.general.label,
  dao: defaultDiscoveryRankingCategoryLabels.dao.label,
  politics: defaultDiscoveryRankingCategoryLabels.politics.label,
  sports: defaultDiscoveryRankingCategoryLabels.sports.label,
  tech: defaultDiscoveryRankingCategoryLabels.tech.label,
  research: defaultDiscoveryRankingCategoryLabels.research.label,
  culture: defaultDiscoveryRankingCategoryLabels.culture.label,
};

export type DiscoverySecondaryCapsulePageState =
  | "visible"
  | "hidden"
  | "deleted";

export const DEFAULT_SECONDARY_CAPSULES: ReadonlyArray<{
  id: DiscoveryRankingCategoryId;
  label: string;
  displayOrder: number;
  pageState: DiscoverySecondaryCapsulePageState;
}> = DISCOVERY_RANKING_CATEGORY_IDS.map((id, index) => ({
  id,
  label: defaultDiscoveryRankingFilterLabels[id],
  displayOrder: index,
  pageState: "visible",
}));

export const discoveryDirectoryDefinitions: DiscoveryDirectoryDefinition[] = [
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
    slug: "dao",
    pathname: "/zh/dao",
    label: "DAO",
    title: "DAO",
    directoryLabel: "DAO 命题",
    description: "DAO 治理、国库、委托与协议研究命题",
    marketFilter: (market) => market.category === "dao",
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

const SYSTEM_DIRECTORY_SLUGS: ReadonlySet<string> = new Set(
  discoveryDirectoryDefinitions.map((definition) => definition.slug),
);

const RESERVED_CUSTOM_SLUGS: ReadonlySet<string> = new Set([
  "ops",
  "admin",
  "api",
  "auth",
  "event",
  "events",
  "markets",
  "results",
  "rewards",
  "watchlist",
  "drafts",
  "submissions",
  "leaderboard",
  "docs",
  "help",
  "contact",
  "predictions",
  "categories",
  "pages",
  "menu",
  "language",
  "share",
  "breaking",
  "hot",
  "new",
  "latest",
  "adjudication",
  "challenges",
  "accuracy",
  "market-integrity",
  "activity",
  "dev",
  "c",
]);

export function getDiscoveryDirectoryDefinitionByPathname(
  pathname: string,
): DiscoveryDirectoryDefinition | null {
  return (
    discoveryDirectoryDefinitions.find((item) => item.pathname === pathname) ??
    null
  );
}

export function getDiscoveryDirectoryDefinitionBySlug(
  slug: string,
): DiscoveryDirectoryDefinition | null {
  return discoveryDirectoryDefinitions.find((item) => item.slug === slug) ?? null;
}

export function isSystemDirectorySlug(slug: string): boolean {
  return SYSTEM_DIRECTORY_SLUGS.has(slug.trim());
}

export function isReservedCustomSlug(slug: string): boolean {
  return RESERVED_CUSTOM_SLUGS.has(slug.trim());
}

export function isValidCustomDirectorySlug(slug: string): boolean {
  const normalizedSlug = slug.trim();
  return (
    CUSTOM_SLUG_PATTERN.test(normalizedSlug) &&
    !isSystemDirectorySlug(normalizedSlug) &&
    !isReservedCustomSlug(normalizedSlug)
  );
}

export function buildCustomDirectoryPathname(slug: string): string {
  return `${CUSTOM_DIRECTORY_PATHNAME_PREFIX}${slug.trim()}`;
}

export function extractCustomDirectorySlugFromPathname(
  pathname: string,
): string | null {
  if (!pathname.startsWith(CUSTOM_DIRECTORY_PATHNAME_PREFIX)) {
    return null;
  }

  const slug = pathname.slice(CUSTOM_DIRECTORY_PATHNAME_PREFIX.length).trim();
  return isValidCustomDirectorySlug(slug) ? slug : null;
}

export function isCustomDirectoryPathname(pathname: string): boolean {
  return extractCustomDirectorySlugFromPathname(pathname) !== null;
}

export function getDefaultDiscoveryDirectoryIndexItems(): PublicCategoryDirectoryIndexItemViewModel[] {
  return discoveryDirectoryDefinitions.map((definition) => ({
    slug: definition.slug,
    pathname: definition.pathname,
    label: definition.label,
    title: definition.title,
    directoryLabel: definition.directoryLabel,
    description: definition.description,
  }));
}

export function filterMarketsForDiscoveryDirectory(
  markets: ValidationMarketViewModel[],
  pathname: string,
): ValidationMarketViewModel[] {
  const definition = getDiscoveryDirectoryDefinitionByPathname(pathname);
  if (!definition) {
    return [];
  }

  return markets.filter((market) => definition.marketFilter(market));
}
