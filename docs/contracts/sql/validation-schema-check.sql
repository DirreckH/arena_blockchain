-- Validation-chain schema presence
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'market'
  and column_name in (
    'chain_market_id',
    'chain_proposition_id',
    'chain_status',
    'chain_opened_at',
    'chain_frozen_at',
    'chain_resolved_at',
    'chain_cancelled_at',
    'chain_result_kind',
    'chain_winning_option',
    'chain_void_reason',
    'resolution_tx_hash',
    'cancel_tx_hash',
    'chain_synced_at'
  )
order by column_name;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bet'
  and column_name in (
    'claimed',
    'claimed_at',
    'claim_tx_hash',
    'refunded_at',
    'refund_tx_hash',
    'chain_synced_at'
  )
order by column_name;

select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('validation_chain_event', 'validation_chain_cursor')
order by tablename;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('market', 'validation_chain_event', 'validation_chain_cursor')
order by tablename, indexname;

-- Validation-chain event and cursor health
select stream_key,
       chain_id,
       contract_address,
       last_processed_block,
       last_processed_tx_hash,
       last_processed_log_index,
       last_finalized_block,
       sync_status,
       updated_at
from validation_chain_cursor;

select event_name,
       block_number,
       transaction_hash,
       log_index,
       market_chain_id,
       proposition_chain_id,
       processed_at
from validation_chain_event
order by block_number desc, transaction_index desc, log_index desc
limit 50;
