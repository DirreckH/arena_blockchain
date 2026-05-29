import { Injectable } from "@nestjs/common";
import type {
  PublicIntegrityArchiveItemViewModel,
  PublicIntegrityFocusViewModel,
  PublicIntegrityLiveProgressItemViewModel,
  PublicIntegrityOverviewViewModel,
  PublicLifecyclePhase,
  PublicProgressViewModel,
} from "@arena/shared";
import type { Proposition } from "@prisma/client";

import { PropositionRepository } from "../repositories/proposition.repository";
import { EffectiveSampleCounterService } from "./effective-sample-counter.service";
import { PublicResultViewService } from "./public-result-view.service";

const PHASE_LABELS: Record<PublicLifecyclePhase, string> = {
  scheduled: "待开始",
  live: "采集中",
  frozen: "已冻结",
  revealing: "开奖中",
  settled: "已归档",
};

@Injectable()
export class PublicIntegrityViewService {
  constructor(
    private readonly propositions: PropositionRepository,
    private readonly counters: EffectiveSampleCounterService,
    private readonly publicResults: PublicResultViewService,
  ) {}

  async getOverview(
    propositionId?: string,
  ): Promise<PublicIntegrityOverviewViewModel> {
    const generatedAt = new Date().toISOString();
    const liveProgress = await this.listVisibleLiveProgress();
    const settledResults = await this.publicResults.listSettledResults();
    const recentArchiveItems = settledResults.items
      .slice(0, 5)
      .map((item) => this.toArchiveItem(item));

    const phaseCounts = new Map<PublicLifecyclePhase, number>();
    for (const item of liveProgress) {
      phaseCounts.set(item.phase, (phaseCounts.get(item.phase) ?? 0) + 1);
    }

    const phaseBreakdown = (Object.keys(PHASE_LABELS) as PublicLifecyclePhase[])
      .map((phase) => ({
        phase,
        label: PHASE_LABELS[phase],
        count: phaseCounts.get(phase) ?? 0,
      }))
      .filter((entry) => entry.count > 0);

    const averageValidSampleCount = settledResults.totalCount === 0
      ? 0
      : Math.round(
          settledResults.items.reduce(
            (sum, item) => sum + item.validSampleCount,
            0,
          ) / settledResults.totalCount,
        );

    return {
      generatedAt,
      live: {
        totalCount: liveProgress.length,
        reachedSampleThresholdCount: liveProgress.filter(
          (item) => item.reachedSampleThreshold,
        ).length,
        marketEnabledCount: liveProgress.filter((item) => item.marketEnabled).length,
        phaseBreakdown,
        items: liveProgress,
      },
      archive: {
        settledCount: settledResults.totalCount,
        onChainCount: settledResults.items.filter((item) => item.onChain).length,
        averageValidSampleCount,
        latestSettledAt: settledResults.items[0]?.settledAt ?? null,
        recentItems: recentArchiveItems,
      },
      focus: this.resolveFocus({
        propositionId,
        liveItems: liveProgress,
        archiveItems: recentArchiveItems,
        settledResults: settledResults.items.map((item) => this.toArchiveItem(item)),
      }),
    };
  }

  private async listVisibleLiveProgress(): Promise<
    PublicIntegrityLiveProgressItemViewModel[]
  > {
    const propositions = await this.propositions.list({});
    const visible = propositions.filter((proposition) =>
      ["live", "frozen", "revealing"].includes(proposition.status),
    );

    const progress = await Promise.all(
      visible.map(async (proposition) => ({
        proposition,
        progress: await this.counters.getPublicProgress(proposition.id),
      }),
      ),
    );

    return progress
      .map((item) => this.toLiveProgressItem(item.proposition, item.progress))
      .sort((left, right) => {
        const leftDeadline = left.deadlineAt
          ? new Date(left.deadlineAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightDeadline = right.deadlineAt
          ? new Date(right.deadlineAt).getTime()
          : Number.MAX_SAFE_INTEGER;

        return leftDeadline - rightDeadline || left.title.localeCompare(right.title);
      });
  }

  private toLiveProgressItem(
    proposition: Proposition,
    progress: PublicProgressViewModel,
  ): PublicIntegrityLiveProgressItemViewModel {
    return {
      propositionId: progress.propositionId,
      title: progress.title,
      category: proposition.category,
      phase: progress.publicState.phase,
      effectiveSampleCount: progress.progress.currentEffectiveSample,
      requiredSampleCount: progress.progress.totalRequired,
      progressPercent: progress.progress.progressPercent,
      reachedSampleThreshold: progress.publicState.reachedSampleThreshold,
      marketEnabled: progress.marketEnabled,
      deadlineAt: progress.timing.deadlineAt,
    };
  }

  private toArchiveItem(
    item: Awaited<
      ReturnType<PublicResultViewService["listSettledResults"]>
    >["items"][number],
  ): PublicIntegrityArchiveItemViewModel {
    return {
      propositionId: item.propositionId,
      title: item.title,
      category: item.category,
      settledAt: item.settledAt,
      settlementTxHash: item.settlementTxHash,
      onChain: item.onChain,
    };
  }

  private resolveFocus(input: {
    propositionId?: string;
    liveItems: PublicIntegrityLiveProgressItemViewModel[];
    archiveItems: PublicIntegrityArchiveItemViewModel[];
    settledResults: PublicIntegrityArchiveItemViewModel[];
  }): PublicIntegrityFocusViewModel | null {
    const propositionId = input.propositionId?.trim();
    if (!propositionId) {
      return null;
    }

    const liveItem =
      input.liveItems.find((item) => item.propositionId === propositionId) ?? null;
    const archiveItem =
      input.settledResults.find((item) => item.propositionId === propositionId) ?? null;

    return {
      propositionId,
      visible: liveItem !== null || archiveItem !== null,
      source:
        archiveItem !== null ? "archive" : liveItem !== null ? "live" : null,
      liveItem,
      archiveItem,
    };
  }
}
