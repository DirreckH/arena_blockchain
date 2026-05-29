import type { ArenaDiscussionThreadViewModel } from '@arena/shared'

export type DiscussionComment = {
  id: string
  author: string
  handle: string
  tone: string
  timeLabel: string
  minutesAgo: number
  optionIndex?: 0 | 1
  body: string
  likes: number
  replyCount: number
  repliesPreview?: Array<{ author: string; body: string }>
}

export function toDiscussionComments(
  thread: ArenaDiscussionThreadViewModel,
): DiscussionComment[] {
  return thread.comments.map((comment) => ({
    id: comment.id,
    author: comment.author,
    handle: comment.handle,
    tone: comment.tone,
    timeLabel: comment.timeLabel,
    minutesAgo: comment.minutesAgo,
    optionIndex:
      comment.optionIndex === 0 || comment.optionIndex === 1
        ? comment.optionIndex
        : undefined,
    body: comment.body,
    likes: comment.likes,
    replyCount: comment.replyCount,
    repliesPreview: comment.repliesPreview,
  }))
}

export const DEMO_DISCUSSION_COMMENTS: DiscussionComment[] = [
  {
    id: 'comment-1',
    author: 'Lena',
    handle: '@macro_watch',
    tone: '支持形成公开结果',
    timeLabel: '12 分钟前',
    minutesAgo: 12,
    optionIndex: 0,
    body: '从当前公开样本和窗口进度看，已经接近足够证据。关键是最后一轮公开披露能不能按时完成，只要披露时间不再后移，我倾向于结果会形成。',
    likes: 18,
    replyCount: 3,
    repliesPreview: [
      { author: 'Noah', body: '如果今晚来源同步更新，我也会转向这个判断。' },
    ],
  },
  {
    id: 'comment-2',
    author: 'Kai',
    handle: '@event_reader',
    tone: '偏谨慎',
    timeLabel: '28 分钟前',
    minutesAgo: 28,
    optionIndex: 1,
    body: '样本数量虽然接近阈值，但来源一致性还不够稳。这个命题更像会拖到窗口尾部，甚至因为证据标准不齐导致暂时无法形成公开结果。',
    likes: 11,
    replyCount: 2,
    repliesPreview: [
      { author: 'Aya', body: '我同意，尤其是证据标准这一点现在还没有统一。' },
    ],
  },
  {
    id: 'comment-3',
    author: 'Mira',
    handle: '@signal_lane',
    tone: '关注时间窗口',
    timeLabel: '41 分钟前',
    minutesAgo: 41,
    body: '我更想看后续有没有新的公开确认源。如果今晚之前出现第二个高可信来源，这个市场的讨论方向可能会明显倾向 A 选项。',
    likes: 7,
    replyCount: 0,
  },
]
