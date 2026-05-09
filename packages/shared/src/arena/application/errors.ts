export class ArenaApplicationFacadeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class TaskViewNotAccessibleError extends ArenaApplicationFacadeError {
  constructor(taskId: string, userId: string) {
    super(
      "TASK_VIEW_NOT_ACCESSIBLE",
      `Task ${taskId} is not accessible for user ${userId}.`,
    );
  }
}

export class MarketViewNotAccessibleError extends ArenaApplicationFacadeError {
  constructor(marketId: string) {
    super(
      "MARKET_VIEW_NOT_ACCESSIBLE",
      `Market ${marketId} is not accessible through the validation surface.`,
    );
  }
}

export class ResultSummaryNotAvailableError extends ArenaApplicationFacadeError {
  constructor(propositionId: string, status: string) {
    super(
      "RESULT_SUMMARY_NOT_AVAILABLE",
      `Result summary for proposition ${propositionId} is not available while status is ${status}.`,
    );
  }
}
