export class ArenaDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ArenaNotFoundError extends ArenaDomainError {
  constructor(resourceOrCode: string, identifierOrMessage?: string) {
    if (
      typeof identifierOrMessage === "string" &&
      (resourceOrCode.includes(".") || resourceOrCode.includes("_"))
    ) {
      super(resourceOrCode, identifierOrMessage);
      return;
    }

    if (typeof identifierOrMessage === "string") {
      super("ARENA_NOT_FOUND", `${resourceOrCode} ${identifierOrMessage} was not found.`);
      return;
    }

    super("ARENA_NOT_FOUND", resourceOrCode);
  }
}

export class ArenaConflictError extends ArenaDomainError {
  constructor(messageOrCode: string, message?: string) {
    super(message ? messageOrCode : "ARENA_CONFLICT", message ?? messageOrCode);
  }
}

export class ArenaValidationError extends ArenaDomainError {
  constructor(messageOrCode: string, message?: string) {
    super(message ? messageOrCode : "ARENA_VALIDATION_ERROR", message ?? messageOrCode);
  }
}

export class ArenaStateTransitionError extends ArenaDomainError {
  constructor(
    entityOrMessage: string,
    fromOrMessage: string,
    to?: string,
    action?: string,
  ) {
    if (typeof to === "string" && typeof action === "string") {
      super(
        "ARENA_INVALID_STATE_TRANSITION",
        `${entityOrMessage} cannot transition from ${fromOrMessage} to ${to} via ${action}.`,
      );
      return;
    }

    super("ARENA_INVALID_STATE_TRANSITION", fromOrMessage);
  }
}

export class ArenaInvariantError extends ArenaDomainError {
  constructor(messageOrCode: string, message?: string) {
    super(message ? messageOrCode : "ARENA_INVARIANT_ERROR", message ?? messageOrCode);
  }
}
