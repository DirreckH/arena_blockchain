-- Staging-only fallback seed template.
-- Preferred path: create these propositions through the existing Arena proposition authoring flow,
-- then approve / publish them through the internal runtime.
-- Use this only if the authoring entrypoint is unavailable in staging.

insert into proposition (
  id,
  type,
  structure,
  rolling_mode,
  market_enabled,
  settlement_target,
  category,
  title,
  description,
  options,
  sample_constraints,
  min_effective_sample,
  min_bet_amount,
  min_duration_seconds,
  max_duration_seconds,
  reward_budget,
  base_response_reward,
  status,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
) values
(
  '<HAPPY_PROPOSITION_ID>',
  'consensus',
  'binary',
  'non_rolling',
  true,
  'final',
  'general',
  'validation-chain happy path',
  'staging proposition for create/open/freeze/resolve integration',
  array['Yes', 'No'],
  array[]::text[],
  1,
  '100',
  60,
  600,
  '0',
  '0',
  'draft',
  '<ADMIN_USER_ID>',
  '<ADMIN_USER_ID>',
  now(),
  now()
),
(
  '<CANCEL_PROPOSITION_ID>',
  'consensus',
  'binary',
  'non_rolling',
  true,
  'final',
  'general',
  'validation-chain cancel path',
  'staging proposition for create/open/cancel/refund integration',
  array['Yes', 'No'],
  array[]::text[],
  1,
  '100',
  60,
  600,
  '0',
  '0',
  'draft',
  '<ADMIN_USER_ID>',
  '<ADMIN_USER_ID>',
  now(),
  now()
);

-- Optional fallback if claim/refund projection must be rehearsed before wallet integration exists.
-- Ensure user_id exactly matches the EVM address that will later submit on-chain placeBet/claim/refund.
-- Replace <MARKET_ID> only after the local market row has been created by publishLiveProposition().
--
-- insert into bet (
--   id,
--   market_id,
--   proposition_id,
--   user_id,
--   selected_option,
--   stake_amount,
--   status,
--   placed_at,
--   created_at,
--   updated_at
-- ) values (
--   '<BET_ID>',
--   '<MARKET_ID>',
--   '<HAPPY_PROPOSITION_ID>',
--   '0xYourWalletAddress',
--   0,
--   '10000000000000000',
--   'placed',
--   now(),
--   now(),
--   now()
-- );
