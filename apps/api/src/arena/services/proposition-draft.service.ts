import { Injectable } from "@nestjs/common";
import type {
  Proposition,
  PropositionCategory,
} from "@prisma/client";
import {
  PropositionPolicyError,
  assertSupportedMvpPropositionConfig,
} from "@arena/shared";

import { PrismaService } from "../../database/prisma.service";
import {
  ArenaNotFoundError,
  ArenaValidationError,
} from "../arena.errors";
import { INTERNAL_AUDIT_ENTITY_TYPES } from "../internal-ops.types";
import {
  PROPOSITION_AUDIT_ACTIONS,
  buildPropositionSubmissionSnapshot,
  type PropositionSubmissionStatus,
} from "../proposition-submission";
import { withArenaTransaction } from "../arena-transaction.utils";
import type { ArenaDbClient } from "../prisma.types";
import { PropositionRepository } from "../repositories/proposition.repository";
import { InternalAuditService } from "./internal-audit.service";
import { PropositionEngineService } from "./proposition-engine.service";

const DEFAULT_PROPOSITION_DRAFT_CONFIG = {
  category: "general" as PropositionCategory,
  sampleConstraints: [] as string[],
  minEffectiveSample: 3,
  minBetAmount: "10",
  minDurationSeconds: 60,
  maxDurationSeconds: 3600,
  rewardBudget: "1000",
  baseResponseReward: "20",
  marketEnabled: true,
} as const;

interface DraftMutationInput {
  category?: PropositionCategory;
  title?: string;
  summary?: string;
  optionA?: string;
  optionB?: string;
  sampleConstraints?: string[];
  minEffectiveSample?: number;
  minBetAmount?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  rewardBudget?: string;
  baseResponseReward?: string;
  marketEnabled?: boolean;
}

interface CreateDraftInput extends DraftMutationInput {
  userId: string;
  title: string;
  summary: string;
  optionA: string;
  optionB: string;
}

interface GetDraftInput {
  propositionId: string;
  userId: string;
}

interface ListDraftsInput {
  userId: string;
  category?: PropositionCategory;
  submissionStatus?: Extract<PropositionSubmissionStatus, "draft" | "submitted">;
}

interface GetSubmissionInput {
  propositionId: string;
  userId: string;
}

interface ListSubmissionsInput {
  userId: string;
  category?: PropositionCategory;
}

interface UpdateDraftInput extends DraftMutationInput {
  propositionId: string;
  userId: string;
}

interface ArchiveDraftInput {
  propositionId: string;
  userId: string;
}

interface SubmitDraftInput {
  propositionId: string;
  userId: string;
  note?: string;
}

interface WithdrawSubmittedDraftInput {
  propositionId: string;
  userId: string;
  note?: string;
}

interface PropositionDraftEditableState {
  category: PropositionCategory;
  title: string;
  summary: string;
  optionA: string;
  optionB: string;
  sampleConstraints: string[];
  minEffectiveSample: number;
  minBetAmount: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  rewardBudget: string;
  baseResponseReward: string;
  marketEnabled: boolean;
}

export interface PropositionDraftViewModel {
  propositionId: string;
  status: "draft";
  submissionStatus: Extract<PropositionSubmissionStatus, "draft" | "submitted">;
  submittedAt: string | null;
  category: PropositionCategory;
  title: string;
  summary: string;
  optionA: string;
  optionB: string;
  sampleConstraints: string[];
  minEffectiveSample: number;
  minBetAmount: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  rewardBudget: string;
  baseResponseReward: string;
  marketEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArchivePropositionDraftResult {
  propositionId: string;
  archivedAt: string;
}

@Injectable()
export class PropositionDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propositions: PropositionRepository,
    private readonly audits: InternalAuditService,
    private readonly propositionEngine: PropositionEngineService,
  ) {}

  async listDrafts(
    input: ListDraftsInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel[]> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const propositions = await this.propositions.list(
        {
          status: "draft",
          category: input.category,
        },
        tx,
      );
      const audits = await this.audits.listByEntityIds(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        propositions.map((proposition) => proposition.id),
        tx,
      );
      const auditsByPropositionId = this.groupAuditEventsByEntityId(audits);

      return propositions
        .filter((proposition) => proposition.createdByUserId === input.userId)
        .map((proposition) => ({
          proposition,
          submission: this.getDraftSubmissionSnapshot(
            proposition,
            auditsByPropositionId.get(proposition.id) ?? [],
          ),
        }))
        .filter(
          ({ submission }) =>
            input.submissionStatus === undefined ||
            submission.status === input.submissionStatus,
        )
        .sort(
          (left, right) =>
            right.proposition.updatedAt.getTime() -
              left.proposition.updatedAt.getTime() ||
            right.proposition.createdAt.getTime() -
              left.proposition.createdAt.getTime(),
        )
        .map(({ proposition, submission }) =>
          this.toViewModel(proposition, submission),
        );
    });
  }

  async getDraft(
    input: GetDraftInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedDraft(
        input.propositionId,
        input.userId,
        tx,
      );
      const audits = await this.audits.listByEntity(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        proposition.id,
        tx,
      );

      return this.toViewModel(
        proposition,
        this.getDraftSubmissionSnapshot(proposition, audits),
      );
    });
  }

  async listSubmittedDrafts(
    input: ListSubmissionsInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel[]> {
    return this.listDrafts(
      {
        userId: input.userId,
        category: input.category,
        submissionStatus: "submitted",
      },
      db,
    );
  }

  async getSubmittedDraft(
    input: GetSubmissionInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel> {
    const draft = await this.getDraft(
      {
        propositionId: input.propositionId,
        userId: input.userId,
      },
      db,
    );

    if (draft.submissionStatus !== "submitted") {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Submitted proposition ${input.propositionId} was not found`,
      );
    }

    return draft;
  }

  async createDraft(
    input: CreateDraftInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel> {
    const payload = this.buildCreateState(input);

    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.propositionEngine.createProposition(
        {
          category: payload.category,
          title: payload.title,
          description: payload.summary,
          options: [payload.optionA, payload.optionB],
          sampleConstraints: [...payload.sampleConstraints],
          minEffectiveSample: payload.minEffectiveSample,
          minBetAmount: payload.minBetAmount,
          minDurationSeconds: payload.minDurationSeconds,
          maxDurationSeconds: payload.maxDurationSeconds,
          rewardBudget: payload.rewardBudget,
          baseResponseReward: payload.baseResponseReward,
          marketEnabled: payload.marketEnabled,
          createdByUserId: input.userId,
        },
        tx,
      );

      return this.toViewModel(
        proposition,
        this.getDraftSubmissionSnapshot(proposition, []),
      );
    });
  }

  async updateDraft(
    input: UpdateDraftInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedProposition(
        input.propositionId,
        input.userId,
        tx,
      );

      if (proposition.status !== "draft") {
        throw new ArenaValidationError(
          "proposition.draft_not_editable",
          "Only draft propositions can be updated by their creator",
        );
      }
      const audits = await this.audits.listByEntity(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        proposition.id,
        tx,
      );
      const submission = this.getDraftSubmissionSnapshot(proposition, audits);
      if (submission.status === "submitted") {
        throw new ArenaValidationError(
          "proposition.submitted_draft_not_editable",
          "Submitted draft propositions cannot be edited while they are pending review",
        );
      }

      const merged = this.mergeEditableState(
        this.toEditableState(proposition),
        input,
      );

      const updated = await this.propositions.update(
        proposition.id,
        {
          category: merged.category,
          title: merged.title,
          description: merged.summary,
          options: [merged.optionA, merged.optionB],
          sampleConstraints: [...merged.sampleConstraints],
          minEffectiveSample: merged.minEffectiveSample,
          minBetAmount: merged.minBetAmount,
          minDurationSeconds: merged.minDurationSeconds,
          maxDurationSeconds: merged.maxDurationSeconds,
          rewardBudget: merged.rewardBudget,
          baseResponseReward: merged.baseResponseReward,
          marketEnabled: merged.marketEnabled,
          updatedByUserId: input.userId,
        },
        tx,
      );

      return this.toViewModel(updated, submission);
    });
  }

  async submitDraft(
    input: SubmitDraftInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedProposition(
        input.propositionId,
        input.userId,
        tx,
      );

      if (proposition.status !== "draft") {
        throw new ArenaValidationError(
          "proposition.submit_not_allowed",
          "Only draft propositions can be submitted for review",
        );
      }

      const audits = await this.audits.listByEntity(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        proposition.id,
        tx,
      );
      const submission = this.getDraftSubmissionSnapshot(proposition, audits);
      if (submission.status === "submitted") {
        return this.toViewModel(proposition, submission);
      }

      const updatedProposition = await this.propositions.update(
        proposition.id,
        {
          updatedByUserId: input.userId,
        },
        tx,
      );

      const recorded = await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: proposition.id,
          action: PROPOSITION_AUDIT_ACTIONS.submittedForReview,
          actorUserId: input.userId,
          reason: "creator_submitted_for_review",
          note: input.note,
          metadata: {
            propositionStatus: proposition.status,
            marketEnabled: proposition.marketEnabled,
          },
        },
        tx,
      );

      return this.toViewModel(updatedProposition, {
        status: "submitted",
        submittedAt: recorded.createdAt,
        submittedByUserId: recorded.actorUserId,
        submissionReason: recorded.reason,
        submissionNote: recorded.note,
      });
    });
  }

  async withdrawSubmittedDraft(
    input: WithdrawSubmittedDraftInput,
    db?: ArenaDbClient,
  ): Promise<PropositionDraftViewModel> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedProposition(
        input.propositionId,
        input.userId,
        tx,
      );

      if (proposition.status !== "draft") {
        throw new ArenaValidationError(
          "proposition.withdraw_submission_not_allowed",
          "Only submitted draft propositions can be withdrawn from review",
        );
      }

      const audits = await this.audits.listByEntity(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        proposition.id,
        tx,
      );
      const submission = this.getDraftSubmissionSnapshot(proposition, audits);
      if (submission.status !== "submitted") {
        throw new ArenaValidationError(
          "proposition.submission_not_pending",
          "Only draft propositions that are pending review can be withdrawn",
        );
      }

      const updated = await this.propositions.update(
        proposition.id,
        {
          updatedByUserId: input.userId,
        },
        tx,
      );

      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: proposition.id,
          action: PROPOSITION_AUDIT_ACTIONS.withdrawn,
          actorUserId: input.userId,
          reason: "creator_withdrew_submission",
          note: input.note,
          metadata: {
            propositionStatus: proposition.status,
            previousSubmissionStatus: submission.status,
          },
        },
        tx,
      );

      return this.toViewModel(updated, {
        status: "draft",
        submittedAt: null,
        submittedByUserId: null,
        submissionReason: null,
        submissionNote: null,
      });
    });
  }

  async archiveDraft(
    input: ArchiveDraftInput,
    db?: ArenaDbClient,
  ): Promise<ArchivePropositionDraftResult> {
    return withArenaTransaction(this.prisma, db, async (tx) => {
      const proposition = await this.getRequiredOwnedProposition(
        input.propositionId,
        input.userId,
        tx,
      );

      if (proposition.status !== "draft") {
        throw new ArenaValidationError(
          "proposition.delete_not_allowed",
          "Only draft propositions can be deleted by their creator",
        );
      }
      const audits = await this.audits.listByEntity(
        INTERNAL_AUDIT_ENTITY_TYPES.proposition,
        proposition.id,
        tx,
      );
      const submission = this.getDraftSubmissionSnapshot(proposition, audits);
      if (submission.status === "submitted") {
        throw new ArenaValidationError(
          "proposition.submitted_draft_not_deletable",
          "Submitted draft propositions cannot be deleted while they are pending review",
        );
      }

      const archivedAt = new Date();
      const archived = await this.propositions.updateStatus(
        proposition.id,
        "archived",
        {
          archivedAt,
          updatedByUserId: input.userId,
        },
        tx,
      );
      await this.audits.record(
        {
          entityType: INTERNAL_AUDIT_ENTITY_TYPES.proposition,
          entityId: archived.id,
          action: PROPOSITION_AUDIT_ACTIONS.withdrawn,
          actorUserId: input.userId,
          reason: "creator_withdrew_draft",
          metadata: {
            previousStatus: proposition.status,
            archivedAt: archivedAt.toISOString(),
          },
        },
        tx,
      );

      return {
        propositionId: archived.id,
        archivedAt:
          archived.archivedAt?.toISOString() ?? archivedAt.toISOString(),
      };
    });
  }

  private buildCreateState(
    input: CreateDraftInput,
  ): PropositionDraftEditableState {
    return this.assertPolicy(() => ({
      category: input.category ?? DEFAULT_PROPOSITION_DRAFT_CONFIG.category,
      title: this.normalizeRequiredText(input.title, "title"),
      summary: this.normalizeRequiredText(input.summary, "summary"),
      optionA: this.normalizeRequiredText(input.optionA, "optionA"),
      optionB: this.normalizeRequiredText(input.optionB, "optionB"),
      sampleConstraints: this.normalizeStringList(input.sampleConstraints),
      minEffectiveSample:
        input.minEffectiveSample ??
        DEFAULT_PROPOSITION_DRAFT_CONFIG.minEffectiveSample,
      minBetAmount:
        input.minBetAmount ?? DEFAULT_PROPOSITION_DRAFT_CONFIG.minBetAmount,
      minDurationSeconds:
        input.minDurationSeconds ??
        DEFAULT_PROPOSITION_DRAFT_CONFIG.minDurationSeconds,
      maxDurationSeconds:
        input.maxDurationSeconds ??
        DEFAULT_PROPOSITION_DRAFT_CONFIG.maxDurationSeconds,
      rewardBudget:
        input.rewardBudget ?? DEFAULT_PROPOSITION_DRAFT_CONFIG.rewardBudget,
      baseResponseReward:
        input.baseResponseReward ??
        DEFAULT_PROPOSITION_DRAFT_CONFIG.baseResponseReward,
      marketEnabled:
        input.marketEnabled ?? DEFAULT_PROPOSITION_DRAFT_CONFIG.marketEnabled,
    }));
  }

  private mergeEditableState(
    current: PropositionDraftEditableState,
    input: DraftMutationInput,
  ): PropositionDraftEditableState {
    return this.assertPolicy(() => ({
      category: input.category ?? current.category,
      title:
        input.title === undefined
          ? current.title
          : this.normalizeRequiredText(input.title, "title"),
      summary:
        input.summary === undefined
          ? current.summary
          : this.normalizeRequiredText(input.summary, "summary"),
      optionA:
        input.optionA === undefined
          ? current.optionA
          : this.normalizeRequiredText(input.optionA, "optionA"),
      optionB:
        input.optionB === undefined
          ? current.optionB
          : this.normalizeRequiredText(input.optionB, "optionB"),
      sampleConstraints:
        input.sampleConstraints === undefined
          ? current.sampleConstraints
          : this.normalizeStringList(input.sampleConstraints),
      minEffectiveSample:
        input.minEffectiveSample ?? current.minEffectiveSample,
      minBetAmount: input.minBetAmount ?? current.minBetAmount,
      minDurationSeconds:
        input.minDurationSeconds ?? current.minDurationSeconds,
      maxDurationSeconds:
        input.maxDurationSeconds ?? current.maxDurationSeconds,
      rewardBudget: input.rewardBudget ?? current.rewardBudget,
      baseResponseReward:
        input.baseResponseReward ?? current.baseResponseReward,
      marketEnabled: input.marketEnabled ?? current.marketEnabled,
    }));
  }

  private assertPolicy(
    buildState: () => PropositionDraftEditableState,
  ): PropositionDraftEditableState {
    try {
      const state = buildState();

      assertSupportedMvpPropositionConfig({
        type: "consensus",
        structure: "binary",
        rollingMode: "non_rolling",
        settlementTarget: "final",
        options: [state.optionA, state.optionB],
        sampleConstraints: [...state.sampleConstraints],
        minEffectiveSample: state.minEffectiveSample,
        minDurationSeconds: state.minDurationSeconds,
        maxDurationSeconds: state.maxDurationSeconds,
        minBetAmount: state.minBetAmount,
        rewardBudget: state.rewardBudget,
        baseResponseReward: state.baseResponseReward,
        marketEnabled: state.marketEnabled,
      });

      return state;
    } catch (error) {
      if (error instanceof PropositionPolicyError) {
        throw new ArenaValidationError(error.code, error.message);
      }

      throw error;
    }
  }

  private normalizeRequiredText(value: string, field: string): string {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new ArenaValidationError(
        `proposition.invalid_${field}`,
        `${field} must not be empty`,
      );
    }

    return normalized;
  }

  private normalizeStringList(values: string[] | undefined): string[] {
    if (!values) {
      return [];
    }

    return values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private toEditableState(
    proposition: Proposition,
  ): PropositionDraftEditableState {
    return {
      category: proposition.category,
      title: proposition.title,
      summary: proposition.description,
      optionA: proposition.options[0] ?? "",
      optionB: proposition.options[1] ?? "",
      sampleConstraints: [...proposition.sampleConstraints],
      minEffectiveSample: proposition.minEffectiveSample,
      minBetAmount: proposition.minBetAmount,
      minDurationSeconds: proposition.minDurationSeconds,
      maxDurationSeconds: proposition.maxDurationSeconds,
      rewardBudget: proposition.rewardBudget,
      baseResponseReward: proposition.baseResponseReward,
      marketEnabled: proposition.marketEnabled,
    };
  }

  private toViewModel(
    proposition: Proposition,
    submission = this.getDraftSubmissionSnapshot(proposition, []),
  ): PropositionDraftViewModel {
    return {
      propositionId: proposition.id,
      status: "draft",
      submissionStatus: submission.status === "submitted" ? "submitted" : "draft",
      submittedAt: submission.submittedAt,
      category: proposition.category,
      title: proposition.title,
      summary: proposition.description,
      optionA: proposition.options[0] ?? "",
      optionB: proposition.options[1] ?? "",
      sampleConstraints: [...proposition.sampleConstraints],
      minEffectiveSample: proposition.minEffectiveSample,
      minBetAmount: proposition.minBetAmount,
      minDurationSeconds: proposition.minDurationSeconds,
      maxDurationSeconds: proposition.maxDurationSeconds,
      rewardBudget: proposition.rewardBudget,
      baseResponseReward: proposition.baseResponseReward,
      marketEnabled: proposition.marketEnabled,
      createdAt: proposition.createdAt.toISOString(),
      updatedAt: proposition.updatedAt.toISOString(),
    };
  }

  private groupAuditEventsByEntityId(
    auditEvents: Awaited<ReturnType<InternalAuditService["listByEntityIds"]>>,
  ): Map<string, Awaited<ReturnType<InternalAuditService["listByEntity"]>>> {
    const grouped = new Map<
      string,
      Awaited<ReturnType<InternalAuditService["listByEntity"]>>
    >();

    for (const event of auditEvents) {
      const list = grouped.get(event.entityId) ?? [];
      list.push(event);
      grouped.set(event.entityId, list);
    }

    return grouped;
  }

  private getDraftSubmissionSnapshot(
    proposition: Proposition,
    auditEvents: Awaited<ReturnType<InternalAuditService["listByEntity"]>>,
  ) {
    const latestWithdrawIndex = auditEvents.findIndex(
      (event) => event.action === PROPOSITION_AUDIT_ACTIONS.withdrawn,
    );
    const latestSubmitIndex = auditEvents.findIndex(
      (event) => event.action === PROPOSITION_AUDIT_ACTIONS.submittedForReview,
    );

    if (
      proposition.status === "draft" &&
      latestWithdrawIndex !== -1 &&
      (latestSubmitIndex === -1 || latestWithdrawIndex < latestSubmitIndex)
    ) {
      return {
        status: "draft" as const,
        submittedAt: null,
        submittedByUserId: null,
        submissionReason: null,
        submissionNote: null,
      };
    }

    return buildPropositionSubmissionSnapshot(proposition, auditEvents);
  }

  private async getRequiredOwnedDraft(
    propositionId: string,
    userId: string,
    db: ArenaDbClient,
  ): Promise<Proposition> {
    const proposition = await this.getRequiredOwnedProposition(
      propositionId,
      userId,
      db,
    );

    if (proposition.status !== "draft") {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Draft proposition ${propositionId} was not found`,
      );
    }

    return proposition;
  }

  private async getRequiredOwnedProposition(
    propositionId: string,
    userId: string,
    db: ArenaDbClient,
  ): Promise<Proposition> {
    const proposition = await this.propositions.findById(propositionId, db);
    if (!proposition || proposition.createdByUserId !== userId) {
      throw new ArenaNotFoundError(
        "proposition.not_found",
        `Proposition ${propositionId} was not found`,
      );
    }

    return proposition;
  }
}
