export const VALIDATION_PRE_REVEAL_ALLOWED_FIELDS = [
  'status',
  'timeProgressPercent',
  'effectiveSampleProgressPercent',
  'effectiveSampleCount',
  'minEffectiveSample',
  'publicPreviousResult',
  'ownUserStatus',
] as const

export const VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS = [
  'probability',
  'odds',
  'currentDirection',
  'leadingOption',
  'responseRatio',
  'voteCountByOption',
  'rawVoteCount',
  'internalSampleDistribution',
  'unrevealedResultTrend',
  'traderSentiment',
  'optionVolume',
  'trend',
  'marketPrice',
] as const

export const ADJUDICATION_FORBIDDEN_MARKET_FIELDS = [
  'odds',
  'optionVolume',
  'currentDirection',
  'traderSentiment',
  'validationLayerHeat',
] as const

export const ARENA_INFORMATION_BOUNDARY = {
  validationPreRevealAllowed: [
    'market/proposition status',
    'time progress',
    'effective sample progress',
    'public previous result, only for rolling propositions',
    'user own pending/settled status if available later',
  ],
  validationPreRevealForbidden: [
    'current adjudication direction',
    'current response ratio',
    'current leading option',
    'raw vote count',
    'internal sample distribution',
    'unrevealed result trend',
  ],
  validationPreRevealAllowedFields: VALIDATION_PRE_REVEAL_ALLOWED_FIELDS,
  validationPreRevealForbiddenFields: VALIDATION_PRE_REVEAL_FORBIDDEN_FIELDS,
  adjudicationForbiddenMarketFields: ADJUDICATION_FORBIDDEN_MARKET_FIELDS,
  adjudicationPageForbidden: [
    'market odds',
    'betting volume by option',
    'current market direction',
    'trader sentiment',
    'validation layer heat',
  ],
  notes: [
    'Frontend hiding is not a security boundary.',
    'Future APIs must enforce the same isolation rules server-side.',
    'This file is the frontend reference for page constraints and tests.',
  ],
} as const

export type ArenaInformationBoundary = typeof ARENA_INFORMATION_BOUNDARY
