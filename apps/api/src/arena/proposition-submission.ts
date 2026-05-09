import type { Proposition } from "@prisma/client";

export const PROPOSITION_AUDIT_ACTIONS = {
  submittedForReview: "proposition_submitted_for_review",
  approved: "proposition_approved",
  rejected: "proposition_rejected",
  withdrawn: "proposition_withdrawn",
  autoPublishedLive: "proposition_auto_published_live",
  autoPreparedReveal: "proposition_auto_prepared_reveal",
  autoSettled: "proposition_auto_settled",
} as const;

export type PropositionSubmissionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "archived";

export interface PropositionSubmissionSnapshot {
  status: PropositionSubmissionStatus;
  submittedAt: string | null;
  submittedByUserId: string | null;
  submissionReason: string | null;
  submissionNote: string | null;
}

interface PropositionAuditEventLike {
  action: string;
  actorUserId: string | null;
  reason: string;
  note: string | null;
  createdAt: Date | string;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

export const buildPropositionSubmissionSnapshot = (
  proposition: Pick<Proposition, "status">,
  auditEvents: readonly PropositionAuditEventLike[],
): PropositionSubmissionSnapshot => {
  const latestSubmissionEvent =
    auditEvents.find(
      (event) => event.action === PROPOSITION_AUDIT_ACTIONS.submittedForReview,
    ) ?? null;
  const hasRejectedEvent = auditEvents.some(
    (event) => event.action === PROPOSITION_AUDIT_ACTIONS.rejected,
  );
  const hasWithdrawnEvent = auditEvents.some(
    (event) => event.action === PROPOSITION_AUDIT_ACTIONS.withdrawn,
  );
  const hasApprovedEvent = auditEvents.some(
    (event) => event.action === PROPOSITION_AUDIT_ACTIONS.approved,
  );

  if (proposition.status === "archived") {
    if (hasRejectedEvent) {
      return toSnapshot("rejected", latestSubmissionEvent);
    }

    if (hasWithdrawnEvent) {
      return toSnapshot("withdrawn", latestSubmissionEvent);
    }

    return toSnapshot("archived", latestSubmissionEvent);
  }

  if (
    proposition.status !== "draft" ||
    hasApprovedEvent
  ) {
    return toSnapshot("approved", latestSubmissionEvent);
  }

  if (latestSubmissionEvent) {
    return toSnapshot("submitted", latestSubmissionEvent);
  }

  return toSnapshot("draft", null);
};

const toSnapshot = (
  status: PropositionSubmissionStatus,
  latestSubmissionEvent: PropositionAuditEventLike | null,
): PropositionSubmissionSnapshot => ({
  status,
  submittedAt: latestSubmissionEvent ? toIso(latestSubmissionEvent.createdAt) : null,
  submittedByUserId: latestSubmissionEvent?.actorUserId ?? null,
  submissionReason: latestSubmissionEvent?.reason ?? null,
  submissionNote: latestSubmissionEvent?.note ?? null,
});
