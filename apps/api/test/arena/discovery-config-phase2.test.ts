import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";

import { ArenaIdService } from "../../src/arena/arena-id.service";
import { ArenaValidationError } from "../../src/arena/arena.errors";
import { DiscoveryConfigService } from "../../src/arena/services/discovery-config.service";
import { PublicDiscoveryService } from "../../src/arena/services/public-discovery.service";
import { ValidationViewService } from "../../src/arena/services/validation-view.service";
import { createArenaHarness } from "./harness";

const propositionDraftInput = {
  category:
    "general" as
      | "general"
      | "sports"
      | "ai"
      | "brand_research"
      | "politics"
      | "entertainment",
  title: "Will option A win?",
  description: "MVP binary proposition",
  options: ["A", "B"] as [string, string],
  minEffectiveSample: 3,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  sampleConstraints: [] as string[],
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: false,
  createdByUserId: "admin_1",
};

const arenaTime = (minuteOffset: number, secondOffset = 0): string =>
  new Date(
    Date.parse("2026-04-18T10:06:00.000Z") +
      minuteOffset * 60_000 +
      secondOffset * 1000,
  ).toISOString();

async function createLiveProposition(
  harness: ReturnType<typeof createArenaHarness>,
  overrides: Partial<typeof propositionDraftInput> = {},
) {
  const draft = await harness.propositionEngineService.createProposition({
    ...propositionDraftInput,
    ...overrides,
  });
  const scheduled =
    await harness.propositionEngineService.approveOrScheduleProposition({
      propositionId: draft.id,
      publishedAt: "2026-04-18T10:00:00.000Z",
      updatedByUserId: "admin_1",
    });

  return harness.propositionEngineService.publishLiveProposition({
    propositionId: scheduled.id,
    liveAt: "2026-04-18T10:05:00.000Z",
    updatedByUserId: "admin_1",
  });
}

async function createReviewedResponseForProposition(
  harness: ReturnType<typeof createArenaHarness>,
  input: {
    propositionId: string;
    userId: string;
    minuteOffset: number;
    reviewStatus: "valid" | "partial_valid";
  },
) {
  const [task] = await harness.dispatchEngineService.createDispatchTasksForProposition({
    propositionId: input.propositionId,
    userIds: [input.userId],
    assignedAt: arenaTime(input.minuteOffset),
    expiresAt: arenaTime(input.minuteOffset + 10),
  });

  const response = await harness.responseService.submitResponse({
    propositionId: input.propositionId,
    taskId: task!.id,
    userId: input.userId,
    selectedOption: 0,
    confirmationOption: 0,
    clientStartedAt: arenaTime(input.minuteOffset, 10),
    clientSubmittedAt: arenaTime(input.minuteOffset, 20),
    understandingAck: true,
    submittedAt: arenaTime(input.minuteOffset, 20),
  });

  await harness.responseReviewService.finalizeReviewResult({
    responseId: response.id,
    status: input.reviewStatus,
    reviewedAt: arenaTime(input.minuteOffset, 30),
    reviewedByUserId: "reviewer_1",
    qualityScore: input.reviewStatus === "valid" ? 100 : 60,
    flags: [],
    reasonCodes:
      input.reviewStatus === "valid"
        ? ["passes_quality_review"]
        : ["attention_mismatch"],
  });

  return response;
}

function createValidationViews(harness: ReturnType<typeof createArenaHarness>) {
  return new ValidationViewService(
    harness.config as any,
    harness.propositionRepository as any,
    harness.counterRepository as any,
    harness.marketRepository as any,
    harness.betRepository as any,
  );
}

test("custom discovery categories and capsules flow through public discovery outputs", async () => {
  const harness = createArenaHarness();

  const politics = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 2,
    title: "Config politics proposition",
    category: "politics",
  });
  const sports = await createLiveProposition(harness, {
    marketEnabled: true,
    minEffectiveSample: 1,
    title: "Config sports proposition",
    category: "sports",
  });

  await createReviewedResponseForProposition(harness, {
    propositionId: politics.id,
    userId: "config_politics_user",
    minuteOffset: 330,
    reviewStatus: "valid",
  });
  await createReviewedResponseForProposition(harness, {
    propositionId: sports.id,
    userId: "config_sports_user",
    minuteOffset: 331,
    reviewStatus: "valid",
  });

  await harness.counterService.rebuildCounterForProposition(politics.id);
  await harness.counterService.rebuildCounterForProposition(sports.id);

  const validationViews = createValidationViews(harness);
  const discoveryConfig = new DiscoveryConfigService(
    new ArenaIdService(),
    harness.systemKeyValueRepository as any,
    validationViews,
  );

  const politicsMarket = (
    await harness.marketRepository.findByPropositionId(politics.id)
  )!;
  const sportsMarket = (
    await harness.marketRepository.findByPropositionId(sports.id)
  )!;

  await discoveryConfig.updateGlobalConfig({
    categories: [
      {
        slug: "politics",
        label: "Policy Radar",
        title: "Politics",
        directoryLabel: "Politics Directory",
        description: "Policy topics and public governance",
        displayOrder: -10,
      },
      {
        slug: "esports",
        label: "Esports",
        title: "Esports",
        directoryLabel: "Esports Directory",
        description: "Operator curated esports markets",
        displayOrder: -9,
        pageState: "visible",
        kind: "custom",
        marketIdWhitelist: [sportsMarket.id, "missing_custom_market"],
      },
    ],
    rankingCategoryLabels: {
      all: "All Tracks",
      general: "General",
      politics: "Policy",
      sports: "Sports",
      tech: "Tech",
      research: "Research",
      culture: "Culture",
    },
    secondaryCapsules: [
      {
        id: "sports",
        label: "Sports",
        pageState: "visible",
      },
      {
        id: "cap-esports",
        label: "Esports Picks",
        pageState: "visible",
        kind: "custom",
        marketIdWhitelist: [sportsMarket.id, "missing_capsule_market"],
      },
    ],
  });

  const publicDiscovery = new PublicDiscoveryService(validationViews, discoveryConfig);
  const globalConfig = await discoveryConfig.getGlobalConfig();
  const index = await publicDiscovery.getCategoryDirectoryIndex();
  const home = await publicDiscovery.getHome();
  const ranking = await publicDiscovery.getRanking("hot");
  const customDirectory = await publicDiscovery.getCategoryDirectory("esports");

  assert.deepEqual(
    globalConfig.categories.find((item) => item.slug === "esports"),
    {
      slug: "esports",
      pathname: "/zh/c/esports",
      label: "Esports",
      title: "Esports",
      directoryLabel: "Esports Directory",
      description: "Operator curated esports markets",
      displayOrder: -9,
      pageState: "visible",
      kind: "custom",
      marketIdWhitelist: [sportsMarket.id, "missing_custom_market"],
      invalidMarketIds: ["missing_custom_market"],
    },
  );
  assert.equal(
    index.items.some(
      (item) => item.slug === "esports" && item.pathname === "/zh/c/esports",
    ),
    true,
  );
  assert.equal(
    home.sections.some((section) => section.href === "/zh/c/esports"),
    true,
  );
  assert.deepEqual(
    ranking.categories.find((category) => category.id === "cap-esports"),
    {
      id: "cap-esports",
      label: "Esports Picks",
      marketIds: [sportsMarket.id],
    },
  );
  assert.equal(customDirectory?.title, "Esports");
  assert.equal(customDirectory?.featuredMarketId, sportsMarket.id);
  assert.deepEqual(customDirectory?.marketIds, [sportsMarket.id]);
  assert.deepEqual(customDirectory?.sidebarItems, [
    {
      label: "All",
      count: "1",
    },
    {
      label: "Collecting",
      count: "1",
    },
    {
      label: "Ready",
      count: "1",
    },
    {
      label: "Frozen",
      count: "0",
    },
    {
      label: "Revealing",
      count: "0",
    },
    {
      label: "Settled",
      count: "0",
    },
  ]);
  assert.equal(
    ranking.items.some((item) => item.id === sportsMarket.id),
    true,
  );
  assert.equal(
    ranking.items.some((item) => item.id === politicsMarket.id),
    true,
  );
  assert.equal(
    customDirectory?.sidebarItems.every((item) => item.marketIds === undefined),
    true,
  );
});

test("reserved custom slugs are rejected and system capsules degrade deleted to hidden", async () => {
  const harness = createArenaHarness();
  const validationViews = createValidationViews(harness);
  const discoveryConfig = new DiscoveryConfigService(
    new ArenaIdService(),
    harness.systemKeyValueRepository as any,
    validationViews,
  );

  await assert.rejects(
    () =>
      discoveryConfig.updateGlobalConfig({
        categories: [
          {
            slug: "admin",
            title: "Admin",
            label: "Admin",
            directoryLabel: "Admin",
            description: "Reserved",
            kind: "custom",
            marketIdWhitelist: [],
          },
        ],
        rankingCategoryLabels: {},
        secondaryCapsules: [],
      }),
    (error) =>
      error instanceof ArenaValidationError &&
      error.code === "discovery_config.invalid_custom_slug",
  );

  await discoveryConfig.updateGlobalConfig({
    categories: [
      {
        slug: "politics",
        title: "Politics",
      },
    ],
    rankingCategoryLabels: {},
    secondaryCapsules: [
      {
        id: "sports",
        pageState: "deleted",
      },
    ],
  });

  const globalConfig = await discoveryConfig.getGlobalConfig();
  assert.equal(
    globalConfig.secondaryCapsules.find((capsule) => capsule.id === "sports")?.pageState,
    "hidden",
  );
  assert.equal(
    globalConfig.secondaryCapsules.find((capsule) => capsule.id === "sports")?.kind,
    "system",
  );
});
