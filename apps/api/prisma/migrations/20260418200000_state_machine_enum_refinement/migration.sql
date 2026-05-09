ALTER TYPE "PropositionStatus" ADD VALUE IF NOT EXISTS 'frozen' AFTER 'live';
ALTER TYPE "DispatchTaskStatus" ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'expired';
ALTER TYPE "MarketStatus" ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'settled';
