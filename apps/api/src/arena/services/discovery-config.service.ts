import { Injectable } from "@nestjs/common";
import type {
  PublicCategoryDirectoryViewModel,
  ValidationMarketViewModel,
} from "@arena/shared";
import type { Prisma } from "@prisma/client";

import type {
  InternalDiscoveryCategoryConfigInput,
  InternalDiscoveryCategoryConfigSummaryViewModel,
  InternalDiscoveryCategoryConfigViewModel,
  InternalDiscoveryCategoryPageState,
  InternalDiscoveryGlobalCategoryConfigInput,
  InternalDiscoveryGlobalCategoryConfigViewModel,
  InternalDiscoveryGlobalConfigInput,
  InternalDiscoveryGlobalConfigViewModel,
  InternalDiscoveryRankingCategoryLabelMap,
  InternalDiscoverySecondaryCapsuleBaseRankingId,
  InternalDiscoverySecondaryCapsuleInput,
  InternalDiscoverySecondaryCapsulePageState,
  InternalDiscoverySecondaryCapsuleViewModel,
  InternalDiscoverySidebarItemInput,
  InternalDiscoverySidebarItemViewModel,
} from "../internal-ops.types";
import { ArenaIdService } from "../arena-id.service";
import { ArenaNotFoundError, ArenaValidationError } from "../arena.errors";
import {
  DEFAULT_SECONDARY_CAPSULES,
  DISCOVERY_RANKING_CATEGORY_IDS,
  buildCustomDirectoryPathname,
  defaultDiscoveryRankingFilterLabels,
  discoveryDirectoryDefinitions,
  filterMarketsForDiscoveryDirectory,
  getDiscoveryDirectoryDefinitionBySlug,
  isValidCustomDirectorySlug,
} from "../discovery-config.contract";
import { SystemKeyValueRepository } from "../repositories/system-key-value.repository";
import { ValidationViewService } from "./validation-view.service";

const DISCOVERY_CONFIG_NAMESPACE = "arena.public.discovery_config";
const GLOBAL_CONFIG_KEY = `${DISCOVERY_CONFIG_NAMESPACE}.global`;
const CATEGORY_CONFIG_KEY_PREFIX = `${DISCOVERY_CONFIG_NAMESPACE}.category.`;

type StoredGlobalConfig = {
  categories: InternalDiscoveryGlobalCategoryConfigViewModel[];
  rankingCategoryLabels: Partial<InternalDiscoveryRankingCategoryLabelMap>;
  secondaryCapsules: InternalDiscoverySecondaryCapsuleViewModel[];
};

type StoredCategoryConfig = {
  slug: string;
  sidebarItems: InternalDiscoverySidebarItemInput[];
};

const defaultGlobalCategories: InternalDiscoveryGlobalCategoryConfigViewModel[] =
  discoveryDirectoryDefinitions.map((definition, index) => ({
    slug: definition.slug,
    pathname: definition.pathname,
    label: definition.label,
    title: definition.title,
    directoryLabel: definition.directoryLabel,
    description: definition.description,
    displayOrder: index,
    pageState: "visible",
    kind: "system",
    marketIdWhitelist: [],
    invalidMarketIds: [],
  }));

const defaultRankingCategoryLabels: InternalDiscoveryRankingCategoryLabelMap = {
  ...defaultDiscoveryRankingFilterLabels,
};

const defaultGlobalCategoryOrderBySlug = new Map(
  defaultGlobalCategories.map((category, index) => [category.slug, index] as const),
);

const CUSTOM_SECONDARY_CAPSULE_ID_PATTERN = /^cap-[a-z0-9-]{1,96}$/;

function normalizeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizePageState(
  value: string | null | undefined,
  fallback: InternalDiscoveryCategoryPageState = "visible",
): InternalDiscoveryCategoryPageState {
  return value === "hidden" || value === "deleted" || value === "visible"
    ? value
    : fallback;
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return dedupeStrings(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function isSystemSecondaryCapsuleId(
  id: string,
): id is InternalDiscoverySecondaryCapsuleBaseRankingId {
  return DISCOVERY_RANKING_CATEGORY_IDS.includes(
    id as InternalDiscoverySecondaryCapsuleBaseRankingId,
  );
}

function isValidCustomSecondaryCapsuleId(id: string): boolean {
  const normalizedId = id.trim();
  return (
    CUSTOM_SECONDARY_CAPSULE_ID_PATTERN.test(normalizedId) &&
    !isSystemSecondaryCapsuleId(normalizedId)
  );
}

function normalizeSecondaryCapsulePageState(
  value: string | null | undefined,
  fallback: InternalDiscoverySecondaryCapsulePageState = "visible",
): InternalDiscoverySecondaryCapsulePageState {
  return value === "hidden" || value === "deleted" || value === "visible"
    ? value
    : fallback;
}

function buildInvalidMarketIds(
  marketIdWhitelist: string[],
  validMarketIds: ReadonlySet<string>,
) {
  return marketIdWhitelist.filter((marketId) => !validMarketIds.has(marketId));
}

function compareByDisplayOrderThenSlug(
  left: { slug: string; displayOrder: number; kind: string },
  right: { slug: string; displayOrder: number; kind: string },
) {
  const orderDelta = left.displayOrder - right.displayOrder;
  if (orderDelta !== 0) {
    return orderDelta;
  }

  const leftDefaultOrder =
    defaultGlobalCategoryOrderBySlug.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
  const rightDefaultOrder =
    defaultGlobalCategoryOrderBySlug.get(right.slug) ?? Number.MAX_SAFE_INTEGER;
  if (leftDefaultOrder !== rightDefaultOrder) {
    return leftDefaultOrder - rightDefaultOrder;
  }

  if (left.kind !== right.kind) {
    return left.kind === "system" ? -1 : 1;
  }

  return left.slug.localeCompare(right.slug);
}

function compareSecondaryCapsulesByDisplayOrder(
  left: InternalDiscoverySecondaryCapsuleViewModel,
  right: InternalDiscoverySecondaryCapsuleViewModel,
) {
  const orderDelta = left.displayOrder - right.displayOrder;
  if (orderDelta !== 0) {
    return orderDelta;
  }

  if (left.kind !== right.kind) {
    return left.kind === "system" ? -1 : 1;
  }

  return left.id.localeCompare(right.id);
}

function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneCategoryConfigViewModel(
  value: InternalDiscoveryCategoryConfigViewModel,
): InternalDiscoveryCategoryConfigViewModel {
  return {
    ...value,
    availableMarkets: value.availableMarkets.map((market) => ({ ...market })),
    sidebarItems: value.sidebarItems.map((item) => ({
      ...item,
      linkedMarketIds: [...item.linkedMarketIds],
      invalidLinkedMarketIds: [...item.invalidLinkedMarketIds],
    })),
    warnings: [...value.warnings],
  };
}

@Injectable()
export class DiscoveryConfigService {
  constructor(
    private readonly ids: ArenaIdService,
    private readonly systemKeyValues: SystemKeyValueRepository,
    private readonly validationViews: ValidationViewService,
  ) {}

  async getGlobalConfig(): Promise<InternalDiscoveryGlobalConfigViewModel> {
    const stored = await this.readStoredGlobalConfig();
    const validMarketIds = new Set(
      (await this.validationViews.listMarkets()).map((market) => market.marketId),
    );

    return {
      categories: this.buildEffectiveGlobalCategories(stored, validMarketIds),
      rankingCategoryLabels: this.buildEffectiveRankingCategoryLabels(
        stored?.rankingCategoryLabels ?? {},
      ),
      secondaryCapsules: this.buildEffectiveSecondaryCapsules(
        stored?.secondaryCapsules ?? [],
        stored?.rankingCategoryLabels ?? {},
        validMarketIds,
      ),
    };
  }

  async updateGlobalConfig(
    input: InternalDiscoveryGlobalConfigInput,
  ): Promise<InternalDiscoveryGlobalConfigViewModel> {
    const normalized = this.normalizeStoredGlobalConfig(input);

    await this.systemKeyValues.upsertByKey(
      GLOBAL_CONFIG_KEY,
      {
        id: this.ids.next("system_key_value"),
        key: GLOBAL_CONFIG_KEY,
        description: "Arena public discovery global config",
        valueJson: normalized as unknown as Prisma.InputJsonValue,
      },
      {
        description: "Arena public discovery global config",
        valueJson: normalized as unknown as Prisma.InputJsonValue,
      },
    );

    return this.getGlobalConfig();
  }

  async listCategoryConfigs(): Promise<
    InternalDiscoveryCategoryConfigSummaryViewModel[]
  > {
    const global = await this.getGlobalConfig();
    const storedCategoryConfigs = await this.readStoredCategoryConfigs();
    const categoryConfigBySlug = new Map(
      storedCategoryConfigs.map((entry) => [entry.slug, entry] as const),
    );

    return global.categories.map((category) => ({
      slug: category.slug,
      pathname: category.pathname,
      label: category.label,
      title: category.title,
      directoryLabel: category.directoryLabel,
      description: category.description,
      sidebarItemCount:
        categoryConfigBySlug.get(category.slug)?.sidebarItems.length ?? 0,
      configured: categoryConfigBySlug.has(category.slug),
      pageState: category.pageState,
      kind: category.kind,
    }));
  }

  async getCategoryConfig(
    slug: string,
  ): Promise<InternalDiscoveryCategoryConfigViewModel> {
    const normalizedSlug = slug.trim();
    const categoryMeta = await this.getEffectiveCategoryMetadata(normalizedSlug);
    const categoryMarkets = await this.listCategoryMarketsBySlug(normalizedSlug);
    const stored = await this.readStoredCategoryConfig(normalizedSlug);
    const resolvedSidebarItems = this.resolveSidebarItems(
      stored?.sidebarItems ?? [],
      categoryMarkets,
    );

    return cloneCategoryConfigViewModel({
      slug: categoryMeta.slug,
      pathname: categoryMeta.pathname,
      label: categoryMeta.label,
      title: categoryMeta.title,
      directoryLabel: categoryMeta.directoryLabel,
      description: categoryMeta.description,
      configured: stored !== null,
      pageState: categoryMeta.pageState,
      availableMarkets: categoryMarkets.map((market) => ({
        marketId: market.marketId,
        title: market.title,
      })),
      sidebarItems: resolvedSidebarItems,
      warnings: this.buildSidebarWarnings(resolvedSidebarItems),
      kind: categoryMeta.kind,
    });
  }

  async updateCategoryConfig(
    slug: string,
    input: InternalDiscoveryCategoryConfigInput,
  ): Promise<InternalDiscoveryCategoryConfigViewModel> {
    const normalizedSlug = slug.trim();
    const categoryMeta = await this.getEffectiveCategoryMetadata(normalizedSlug);
    const normalized = this.normalizeStoredCategoryConfig(normalizedSlug, input);

    await this.systemKeyValues.upsertByKey(
      this.buildCategoryKey(normalizedSlug),
      {
        id: this.ids.next("system_key_value"),
        key: this.buildCategoryKey(normalizedSlug),
        description: `Arena public discovery category config for ${normalizedSlug}`,
        valueJson: normalized as unknown as Prisma.InputJsonValue,
      },
      {
        description: `Arena public discovery category config for ${normalizedSlug}`,
        valueJson: normalized as unknown as Prisma.InputJsonValue,
      },
    );

    return this.getCategoryConfig(categoryMeta.slug);
  }

  async getPublicCategoryDirectoryIndexItems() {
    const global = await this.getGlobalConfig();
    return global.categories
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

  async getPublicRankingCategoryLabels() {
    return (await this.getGlobalConfig()).rankingCategoryLabels;
  }

  async getResolvedPublicSidebarItems(
    slug: string,
    categoryMarkets: ValidationMarketViewModel[],
  ): Promise<PublicCategoryDirectoryViewModel["sidebarItems"] | null> {
    const stored = await this.readStoredCategoryConfig(slug);
    if (!stored) {
      return null;
    }

    const validMarketIds = new Set(
      categoryMarkets.map((market) => market.marketId),
    );

    return this.resolveSidebarItems(stored.sidebarItems, categoryMarkets).map(
      (item) => ({
        label: item.label,
        count: String(item.resolvedLinkedMarketCount),
        marketIds: item.linkedMarketIds.filter((marketId) =>
          validMarketIds.has(marketId),
        ),
      }),
    );
  }

  async getPublicSecondaryCapsules() {
    const global = await this.getGlobalConfig();
    return global.secondaryCapsules
      .filter((capsule) => capsule.pageState === "visible")
      .sort((left, right) => {
        const orderDelta = left.displayOrder - right.displayOrder;
        if (orderDelta !== 0) {
          return orderDelta;
        }

        if (left.kind !== right.kind) {
          return left.kind === "system" ? -1 : 1;
        }

        return left.id.localeCompare(right.id);
      })
      .map((capsule) => ({
        id: capsule.baseRankingId ?? capsule.id,
        label: capsule.label,
        ...(capsule.kind === "custom"
          ? {
              marketIds: capsule.marketIdWhitelist.filter((marketId) =>
                capsule.invalidMarketIds.indexOf(marketId) === -1,
              ),
            }
          : {}),
      }));
  }

  private async getEffectiveCategoryMetadata(
    slug: string,
  ): Promise<InternalDiscoveryGlobalCategoryConfigViewModel> {
    const normalizedSlug = slug.trim();
    const category =
      (await this.getGlobalConfig()).categories.find((item) => item.slug === normalizedSlug) ??
      null;

    if (!category) {
      throw new ArenaNotFoundError(
        "discovery_config.category_not_found",
        `Discovery category ${normalizedSlug} was not found`,
      );
    }

    return category;
  }

  private buildCategoryKey(slug: string) {
    return `${CATEGORY_CONFIG_KEY_PREFIX}${slug}`;
  }

  private async listCategoryMarketsBySlug(slug: string) {
    const category = await this.getEffectiveCategoryMetadata(slug);
    const markets = await this.validationViews.listMarkets();
    if (category.kind === "custom") {
      const whitelist = new Set(category.marketIdWhitelist);
      return markets.filter((market) => whitelist.has(market.marketId));
    }

    return filterMarketsForDiscoveryDirectory(markets, category.pathname);
  }

  private async readStoredGlobalConfig(): Promise<StoredGlobalConfig | null> {
    const record = await this.systemKeyValues.findByKey(GLOBAL_CONFIG_KEY);
    if (!record || !isObjectRecord(record.valueJson)) {
      return null;
    }

    const rawCategories = Array.isArray(record.valueJson.categories)
      ? record.valueJson.categories
      : [];
    const rawRankingLabels = isObjectRecord(record.valueJson.rankingCategoryLabels)
      ? record.valueJson.rankingCategoryLabels
      : {};
    const rawSecondaryCapsules = Array.isArray(record.valueJson.secondaryCapsules)
      ? record.valueJson.secondaryCapsules
      : [];

    const categories = rawCategories
      .map((entry) => this.parseStoredGlobalCategoryEntry(entry))
      .filter(
        (
          entry,
        ): entry is InternalDiscoveryGlobalCategoryConfigViewModel => entry !== null,
      );

    const rankingCategoryLabels = Object.fromEntries(
      DISCOVERY_RANKING_CATEGORY_IDS.map((id) => {
        const rawValue = rawRankingLabels[id];
        return [
          id,
          typeof rawValue === "string" && rawValue.trim().length > 0
            ? rawValue.trim()
            : undefined,
        ];
      }).filter(([, value]) => value !== undefined),
    ) as Partial<InternalDiscoveryRankingCategoryLabelMap>;

    const secondaryCapsules = rawSecondaryCapsules
      .map((entry, index) => this.parseStoredSecondaryCapsule(entry, index))
      .filter(
        (
          entry,
        ): entry is InternalDiscoverySecondaryCapsuleViewModel => entry !== null,
      );

    return {
      categories,
      rankingCategoryLabels,
      secondaryCapsules,
    };
  }

  private async readStoredCategoryConfigs(): Promise<StoredCategoryConfig[]> {
    const records = await this.systemKeyValues.listByKeyPrefix(
      CATEGORY_CONFIG_KEY_PREFIX,
    );

    return records
      .map((record) => this.parseStoredCategoryConfig(record.key, record.valueJson))
      .filter((config): config is StoredCategoryConfig => config !== null);
  }

  private async readStoredCategoryConfig(
    slug: string,
  ): Promise<StoredCategoryConfig | null> {
    const record = await this.systemKeyValues.findByKey(this.buildCategoryKey(slug));
    if (!record) {
      return null;
    }

    return this.parseStoredCategoryConfig(record.key, record.valueJson);
  }

  private parseStoredGlobalCategoryEntry(
    value: unknown,
  ): InternalDiscoveryGlobalCategoryConfigViewModel | null {
    if (!isObjectRecord(value)) {
      return null;
    }

    const slug =
      typeof value.slug === "string" ? value.slug.trim() : "";
    if (slug.length === 0) {
      return null;
    }

    const definition = getDiscoveryDirectoryDefinitionBySlug(slug);
    if (definition) {
      const fallback = defaultGlobalCategories.find(
        (item) => item.slug === definition.slug,
      );
      if (!fallback) {
        return null;
      }

      return {
        slug: definition.slug,
        pathname: definition.pathname,
        label: normalizeText(
          typeof value.label === "string" ? value.label : null,
          fallback.label,
        ),
        title: normalizeText(
          typeof value.title === "string" ? value.title : null,
          fallback.title,
        ),
        directoryLabel: normalizeText(
          typeof value.directoryLabel === "string" ? value.directoryLabel : null,
          fallback.directoryLabel,
        ),
        description: normalizeText(
          typeof value.description === "string" ? value.description : null,
          fallback.description,
        ),
        displayOrder:
          typeof value.displayOrder === "number" && Number.isFinite(value.displayOrder)
            ? Math.trunc(value.displayOrder)
            : fallback.displayOrder,
        pageState: normalizePageState(
          typeof value.pageState === "string" ? value.pageState : null,
          fallback.pageState,
        ),
        kind: "system",
        marketIdWhitelist: [],
        invalidMarketIds: [],
      };
    }

    if (!isValidCustomDirectorySlug(slug)) {
      return null;
    }

    const displayOrder =
      typeof value.displayOrder === "number" && Number.isFinite(value.displayOrder)
        ? Math.trunc(value.displayOrder)
        : defaultGlobalCategories.length;
    const label = normalizeText(
      typeof value.label === "string" ? value.label : null,
      slug,
    );

    return {
      slug,
      pathname: buildCustomDirectoryPathname(slug),
      label,
      title: normalizeText(
        typeof value.title === "string" ? value.title : null,
        label,
      ),
      directoryLabel: normalizeText(
        typeof value.directoryLabel === "string" ? value.directoryLabel : null,
        label,
      ),
      description: normalizeText(
        typeof value.description === "string" ? value.description : null,
        `Custom category ${slug}`,
      ),
      displayOrder,
      pageState: normalizePageState(
        typeof value.pageState === "string" ? value.pageState : null,
        "visible",
      ),
      kind: "custom",
      marketIdWhitelist: normalizeStringList(value.marketIdWhitelist),
      invalidMarketIds: [],
    };
  }

  private parseStoredCategoryConfig(
    key: string,
    value: unknown,
  ): StoredCategoryConfig | null {
    if (!isObjectRecord(value)) {
      return null;
    }

    const slugFromValue =
      typeof value.slug === "string" && value.slug.trim().length > 0
        ? value.slug.trim()
        : key.slice(CATEGORY_CONFIG_KEY_PREFIX.length);
    const definition = getDiscoveryDirectoryDefinitionBySlug(slugFromValue);
    if (!definition && !isValidCustomDirectorySlug(slugFromValue)) {
      return null;
    }

    const rawSidebarItems = Array.isArray(value.sidebarItems)
      ? value.sidebarItems
      : [];

    return {
      slug: definition?.slug ?? slugFromValue,
      sidebarItems: rawSidebarItems
        .map((item, index) => this.parseStoredSidebarItem(item, index))
        .filter(
          (item): item is InternalDiscoverySidebarItemInput => item !== null,
        ),
    };
  }

  private parseStoredSidebarItem(
    value: unknown,
    index: number,
  ): InternalDiscoverySidebarItemInput | null {
    if (!isObjectRecord(value)) {
      return null;
    }

    const label = normalizeOptionalText(
      typeof value.label === "string" ? value.label : null,
    );
    if (!label) {
      return null;
    }

    const rawLinkedMarketIds = Array.isArray(value.linkedMarketIds)
      ? value.linkedMarketIds
      : [];
    const linkedMarketIds = dedupeStrings(
      rawLinkedMarketIds
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    );

    return {
      id:
        normalizeOptionalText(
          typeof value.id === "string" ? value.id : null,
        ) ?? `sidebar_item_${index + 1}`,
      label,
      linkedMarketIds,
    };
  }

  private parseStoredSecondaryCapsule(
    value: unknown,
    index: number,
  ): InternalDiscoverySecondaryCapsuleViewModel | null {
    if (!isObjectRecord(value)) {
      return null;
    }

    const id =
      typeof value.id === "string" ? value.id.trim() : "";
    if (id.length === 0) {
      return null;
    }

    const label = normalizeOptionalText(
      typeof value.label === "string" ? value.label : null,
    ) ?? id;
    const displayOrder =
      typeof value.displayOrder === "number" && Number.isFinite(value.displayOrder)
        ? Math.trunc(value.displayOrder)
        : index;
    const pageState = normalizeSecondaryCapsulePageState(
      typeof value.pageState === "string" ? value.pageState : null,
      "visible",
    );

    if (isSystemSecondaryCapsuleId(id)) {
      return {
        id,
        label,
        displayOrder,
        pageState: pageState === "deleted" ? "hidden" : pageState,
        kind: "system",
        baseRankingId: id,
        marketIdWhitelist: [],
        invalidMarketIds: [],
      };
    }

    if (!isValidCustomSecondaryCapsuleId(id)) {
      return null;
    }

    return {
      id,
      label,
      displayOrder,
      pageState,
      kind: "custom",
      baseRankingId: null,
      marketIdWhitelist: normalizeStringList(value.marketIdWhitelist),
      invalidMarketIds: [],
    };
  }

  private normalizeStoredGlobalConfig(
    input: InternalDiscoveryGlobalConfigInput,
  ): StoredGlobalConfig {
    const categories = dedupeStrings(
      input.categories.map((entry) => entry.slug.trim()),
    ).map((slug) => {
      const source = input.categories.find((entry) => entry.slug.trim() === slug);
      if (!source) {
        throw new ArenaValidationError(
          "discovery_config.category_missing",
          `Discovery category ${slug} payload was missing`,
        );
      }

      return this.normalizeGlobalCategoryInput(source);
    });

    const rankingCategoryLabels = Object.fromEntries(
      DISCOVERY_RANKING_CATEGORY_IDS.map((id) => {
        const defaultLabel = defaultRankingCategoryLabels[id];
        return [
          id,
          normalizeText(input.rankingCategoryLabels[id], defaultLabel),
        ];
      }),
    ) as InternalDiscoveryRankingCategoryLabelMap;
    const secondaryCapsules = this.normalizeStoredSecondaryCapsules(
      input.secondaryCapsules ?? [],
      rankingCategoryLabels,
    );

    return {
      categories,
      rankingCategoryLabels,
      secondaryCapsules,
    };
  }

  private normalizeGlobalCategoryInput(
    input: InternalDiscoveryGlobalCategoryConfigInput,
  ): InternalDiscoveryGlobalCategoryConfigViewModel {
    const slug = input.slug.trim();
    const definition = getDiscoveryDirectoryDefinitionBySlug(slug);

    if (definition) {
      const fallback = defaultGlobalCategories.find(
        (item) => item.slug === definition.slug,
      );
      if (!fallback) {
        throw new ArenaNotFoundError(
          "discovery_config.category_not_found",
          `Discovery category ${input.slug} was not found`,
        );
      }

      return {
        slug: definition.slug,
        pathname: definition.pathname,
        label: normalizeText(input.label, fallback.label),
        title: normalizeText(input.title, fallback.title),
        directoryLabel: normalizeText(
          input.directoryLabel,
          fallback.directoryLabel,
        ),
        description: normalizeText(input.description, fallback.description),
        displayOrder:
          typeof input.displayOrder === "number" &&
          Number.isFinite(input.displayOrder)
            ? Math.trunc(input.displayOrder)
            : fallback.displayOrder,
        pageState: normalizePageState(input.pageState, fallback.pageState),
        kind: "system",
        marketIdWhitelist: [],
        invalidMarketIds: [],
      };
    }

    if (!isValidCustomDirectorySlug(slug)) {
      throw new ArenaValidationError(
        "discovery_config.invalid_custom_slug",
        `Discovery category ${input.slug} is not a valid custom slug`,
      );
    }

    const label = normalizeText(input.label, slug);
    return {
      slug,
      pathname: buildCustomDirectoryPathname(slug),
      label,
      title: normalizeText(input.title, label),
      directoryLabel: normalizeText(input.directoryLabel, label),
      description: normalizeText(input.description, `Custom category ${slug}`),
      displayOrder:
        typeof input.displayOrder === "number" && Number.isFinite(input.displayOrder)
          ? Math.trunc(input.displayOrder)
          : defaultGlobalCategories.length,
      pageState: normalizePageState(input.pageState, "visible"),
      kind: "custom",
      marketIdWhitelist: normalizeStringList(input.marketIdWhitelist ?? []),
      invalidMarketIds: [],
    };
  }

  private normalizeStoredSecondaryCapsules(
    input: InternalDiscoverySecondaryCapsuleInput[],
    rankingCategoryLabels: InternalDiscoveryRankingCategoryLabelMap,
  ): InternalDiscoverySecondaryCapsuleViewModel[] {
    const inputById = new Map(
      input
        .map((entry) => [entry.id.trim(), entry] as const)
        .filter(
          ([id, entry]) =>
            isSystemSecondaryCapsuleId(id) && entry.kind !== "custom",
        ),
    );

    const systemCapsules: InternalDiscoverySecondaryCapsuleViewModel[] = DEFAULT_SECONDARY_CAPSULES.map(
      (defaultCapsule) => {
        const override = inputById.get(defaultCapsule.id);
        const labelFallback =
          rankingCategoryLabels[defaultCapsule.id] ?? defaultCapsule.label;
        const displayOrder =
          typeof override?.displayOrder === "number" &&
          Number.isFinite(override.displayOrder)
            ? Math.trunc(override.displayOrder)
            : defaultCapsule.displayOrder;
        const pageState = normalizeSecondaryCapsulePageState(
          typeof override?.pageState === "string"
            ? override.pageState
            : null,
          defaultCapsule.pageState,
        );

        return {
          id: defaultCapsule.id,
          label: normalizeText(override?.label, labelFallback),
          displayOrder,
          pageState: pageState === "deleted" ? "hidden" : pageState,
          kind: "system",
          baseRankingId: defaultCapsule.id,
          marketIdWhitelist: [],
          invalidMarketIds: [],
        } as InternalDiscoverySecondaryCapsuleViewModel;
      },
    );

    const seenCustomIds = new Set<string>();
    const customCapsules: InternalDiscoverySecondaryCapsuleViewModel[] = [];

    for (const entry of input) {
      const id = entry.id.trim();
      if (id.length === 0 || isSystemSecondaryCapsuleId(id)) {
        continue;
      }

      if (!isValidCustomSecondaryCapsuleId(id)) {
        throw new ArenaValidationError(
          "discovery_config.invalid_secondary_capsule_id",
          `Discovery secondary capsule ${entry.id} is not a valid custom capsule id`,
        );
      }

      if (seenCustomIds.has(id)) {
        continue;
      }
      seenCustomIds.add(id);

      const label = normalizeText(entry.label, id);
      customCapsules.push({
        id,
        label,
        displayOrder:
          typeof entry.displayOrder === "number" &&
          Number.isFinite(entry.displayOrder)
            ? Math.trunc(entry.displayOrder)
            : DEFAULT_SECONDARY_CAPSULES.length + customCapsules.length,
        pageState: normalizeSecondaryCapsulePageState(
          entry.pageState,
          "visible",
        ),
        kind: "custom",
        baseRankingId: null,
        marketIdWhitelist: normalizeStringList(entry.marketIdWhitelist ?? []),
        invalidMarketIds: [],
      });
    }

    return [...systemCapsules, ...customCapsules].sort(
      compareSecondaryCapsulesByDisplayOrder,
    );
  }

  private normalizeStoredCategoryConfig(
    slug: string,
    input: InternalDiscoveryCategoryConfigInput,
  ): StoredCategoryConfig {
    return {
      slug: slug.trim(),
      sidebarItems: input.sidebarItems
        .map((item, index) => this.normalizeSidebarItemInput(item, index))
        .filter(
          (item): item is InternalDiscoverySidebarItemInput => item !== null,
        ),
    };
  }

  private normalizeSidebarItemInput(
    input: InternalDiscoverySidebarItemInput,
    index: number,
  ): InternalDiscoverySidebarItemInput | null {
    const label = normalizeOptionalText(input.label);
    if (!label) {
      return null;
    }

    const id = normalizeOptionalText(input.id) ?? `sidebar_item_${index + 1}`;
    const linkedMarketIds = dedupeStrings(
      input.linkedMarketIds
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );

    return {
      id,
      label,
      linkedMarketIds,
    };
  }

  private buildEffectiveGlobalCategories(
    stored: StoredGlobalConfig | null,
    validMarketIds: ReadonlySet<string>,
  ): InternalDiscoveryGlobalCategoryConfigViewModel[] {
    const storedBySlug = new Map(
      (stored?.categories ?? []).map((item) => [item.slug, item] as const),
    );

    const systemCategories = defaultGlobalCategories.map((category) => {
      const override = storedBySlug.get(category.slug);
      const mergedCategory = {
        ...category,
        ...(override ?? {}),
        slug: category.slug,
        pathname: category.pathname,
        kind: "system" as const,
        marketIdWhitelist: [],
        invalidMarketIds: [],
      };

      return mergedCategory;
    });

    const customCategories = (stored?.categories ?? [])
      .filter((category) => category.kind === "custom")
      .map((category) => {
        const marketIdWhitelist = normalizeStringList(category.marketIdWhitelist);
        return {
          ...category,
          pathname: buildCustomDirectoryPathname(category.slug),
          kind: "custom" as const,
          marketIdWhitelist,
          invalidMarketIds: buildInvalidMarketIds(
            marketIdWhitelist,
            validMarketIds,
          ),
        };
      });

    return [...systemCategories, ...customCategories].sort(
      compareByDisplayOrderThenSlug,
    );
  }

  private buildEffectiveRankingCategoryLabels(
    overrides: Partial<InternalDiscoveryRankingCategoryLabelMap>,
  ): InternalDiscoveryRankingCategoryLabelMap {
    return {
      ...defaultRankingCategoryLabels,
      ...Object.fromEntries(
        DISCOVERY_RANKING_CATEGORY_IDS.map((id) => [
          id,
          normalizeText(overrides[id], defaultRankingCategoryLabels[id]),
        ]),
      ),
    };
  }

  private buildEffectiveSecondaryCapsules(
    stored: InternalDiscoverySecondaryCapsuleViewModel[],
    rankingCategoryLabels: Partial<InternalDiscoveryRankingCategoryLabelMap>,
    validMarketIds: ReadonlySet<string>,
  ): InternalDiscoverySecondaryCapsuleViewModel[] {
    const storedById = new Map(
      stored.map((item) => [item.id, item] as const),
    );

    const systemCapsules = DEFAULT_SECONDARY_CAPSULES.map((defaultCapsule) => {
      const override = storedById.get(defaultCapsule.id);
      const labelFallback =
        rankingCategoryLabels[defaultCapsule.id] ?? defaultCapsule.label;
      const displayOrder =
        typeof override?.displayOrder === "number" &&
        Number.isFinite(override.displayOrder)
          ? Math.trunc(override.displayOrder)
          : defaultCapsule.displayOrder;
      const pageState = normalizeSecondaryCapsulePageState(
        override?.pageState,
        defaultCapsule.pageState,
      );

      return {
        id: defaultCapsule.id,
        label: normalizeText(override?.label, labelFallback),
        displayOrder,
        pageState: pageState === "deleted" ? "hidden" : pageState,
        kind: "system" as const,
        baseRankingId: defaultCapsule.id,
        marketIdWhitelist: [],
        invalidMarketIds: [],
      };
    });

    const customCapsules = stored
      .filter((capsule) => capsule.kind === "custom")
      .map((capsule) => {
        const marketIdWhitelist = normalizeStringList(capsule.marketIdWhitelist);
        return {
          ...capsule,
          kind: "custom" as const,
          baseRankingId: null,
          marketIdWhitelist,
          invalidMarketIds: buildInvalidMarketIds(marketIdWhitelist, validMarketIds),
        };
      });

    return [...systemCapsules, ...customCapsules].sort(
      compareSecondaryCapsulesByDisplayOrder,
    );
  }

  private resolveSidebarItems(
    sidebarItems: InternalDiscoverySidebarItemInput[],
    categoryMarkets: ValidationMarketViewModel[],
  ): InternalDiscoverySidebarItemViewModel[] {
    const validMarketIds = new Set(
      dedupeStrings(categoryMarkets.map((market) => market.marketId)),
    );

    return sidebarItems.map((item) => {
      const linkedMarketIds = dedupeStrings(item.linkedMarketIds);
      const invalidLinkedMarketIds = linkedMarketIds.filter(
        (marketId) => !validMarketIds.has(marketId),
      );
      const resolvedLinkedMarketCount = linkedMarketIds.filter((marketId) =>
        validMarketIds.has(marketId),
      ).length;

      return {
        id: item.id,
        label: item.label,
        linkedMarketIds: [...linkedMarketIds],
        resolvedLinkedMarketCount,
        invalidLinkedMarketIds,
      };
    });
  }

  private buildSidebarWarnings(
    sidebarItems: InternalDiscoverySidebarItemViewModel[],
  ) {
    return sidebarItems
      .filter((item) => item.invalidLinkedMarketIds.length > 0)
      .map(
        (item) =>
          `词条“${item.label}”存在 ${item.invalidLinkedMarketIds.length} 个失效或跨分类市场绑定。`,
      );
  }
}
