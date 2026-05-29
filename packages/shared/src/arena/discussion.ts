export type ArenaDiscussionSort = "top" | "new";

export type ArenaDiscussionAvailability =
  | "demo"
  | "settled"
  | "pre_settlement_hidden";

export interface ArenaDiscussionReplyPreviewViewModel {
  author: string;
  body: string;
}

export interface ArenaDiscussionCommentViewModel {
  id: string;
  marketId: string;
  propositionId: string;
  userId: string;
  author: string;
  handle: string;
  tone: string;
  timeLabel: string;
  minutesAgo: number;
  optionIndex: 0 | 1 | null;
  body: string;
  likes: number;
  replyCount: number;
  repliesPreview: ArenaDiscussionReplyPreviewViewModel[];
  createdAt: string;
}

export interface ArenaDiscussionThreadViewModel {
  marketId: string;
  propositionId: string;
  availability: ArenaDiscussionAvailability;
  totalCount: number;
  comments: ArenaDiscussionCommentViewModel[];
}

export interface CreateArenaDiscussionCommentInput {
  marketId: string;
  propositionId: string;
  userId: string;
  body: string;
  optionIndex?: 0 | 1 | null;
  createdAt: string;
}
