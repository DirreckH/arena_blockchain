import type { AccountTone } from './account-shell.mock'

export type WalletBalanceTone = AccountTone

export type WalletBalance = {
  label: string
  amount: string
  unit: string
  delta: string
  detail: string
  tone: WalletBalanceTone
  address: string
}

export type WalletTransferDirection = 'deposit' | 'withdraw'

export type WalletTransferStatus = 'pending' | 'confirmed' | 'failed'

export type WalletTransferRecord = {
  id: string
  time: string
  direction: WalletTransferDirection
  amount: string
  fromLabel: string
  toLabel: string
  status: WalletTransferStatus
  txHash: string
}

export const INITIAL_WALLET_BALANCE: WalletBalance = {
  label: '钱包余额',
  amount: '4,210.55',
  unit: 'USDC',
  delta: '+260.00 / 7 天',
  detail: '链上注入账户，仅用于充值与提现',
  tone: 'neutral',
  address: '0x8f2a…b913',
}

export const INITIAL_MARKET_BALANCE: WalletBalance = {
  label: '市场余额',
  amount: '18,426.12',
  unit: 'USDC',
  delta: '+1,180.42 / 7 天',
  detail: 'Arena 站内可用资金，含进行中仓位与待结算',
  tone: 'positive',
  address: 'Arena Vault',
}

export const INITIAL_WALLET_TRANSFERS: WalletTransferRecord[] = [
  {
    id: 'tx-2026-06-17-01',
    time: '06-17 21:42',
    direction: 'deposit',
    amount: '+1,500.00 USDC',
    fromLabel: '钱包 0x8f2a…b913',
    toLabel: 'Arena Vault',
    status: 'confirmed',
    txHash: '0x4c9e…12af',
  },
  {
    id: 'tx-2026-06-15-02',
    time: '06-15 11:08',
    direction: 'withdraw',
    amount: '-820.00 USDC',
    fromLabel: 'Arena Vault',
    toLabel: '钱包 0x8f2a…b913',
    status: 'confirmed',
    txHash: '0x77a1…904c',
  },
  {
    id: 'tx-2026-06-12-03',
    time: '06-12 09:22',
    direction: 'deposit',
    amount: '+600.00 USDC',
    fromLabel: '钱包 0x8f2a…b913',
    toLabel: 'Arena Vault',
    status: 'confirmed',
    txHash: '0x2e58…aabc',
  },
  {
    id: 'tx-2026-06-09-04',
    time: '06-09 18:45',
    direction: 'withdraw',
    amount: '-2,000.00 USDC',
    fromLabel: 'Arena Vault',
    toLabel: '钱包 0x8f2a…b913',
    status: 'pending',
    txHash: '0x6b30…77f1',
  },
]
