import { SystemRole, type JwtIdentity } from '@arena/shared'

export const DEMO_SESSION_TOKEN = 'arena.demo.session'
export const DEMO_WALLET_ADDRESS = 'demo'

export function isDemoWalletAddress(walletAddress: string) {
  return walletAddress.trim().toLowerCase() === DEMO_WALLET_ADDRESS
}

export function isDemoToken(token: string | null | undefined) {
  return token === DEMO_SESSION_TOKEN
}

export function buildDemoIdentity(chainId: number): JwtIdentity {
  return {
    sub: 'demo-user',
    walletAddress: DEMO_WALLET_ADDRESS,
    chainId,
    roles: [SystemRole.Operator],
  }
}
