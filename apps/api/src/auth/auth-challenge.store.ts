import { Injectable } from "@nestjs/common";

import { RedisService } from "../queue/redis.service";

interface StoredChallenge {
  walletAddress: string;
  chainId: number;
  nonce: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
}

@Injectable()
export class AuthChallengeStore {
  constructor(private readonly redisService: RedisService) {}

  private buildKey(walletAddress: string, chainId: number): string {
    return `auth:challenge:${chainId}:${walletAddress.toLowerCase()}`;
  }

  async save(challenge: StoredChallenge, ttlSeconds: number): Promise<void> {
    await this.redisService.setWithTtl(
      this.buildKey(challenge.walletAddress, challenge.chainId),
      JSON.stringify(challenge),
      ttlSeconds,
    );
  }

  async load(walletAddress: string, chainId: number): Promise<StoredChallenge | null> {
    const value = await this.redisService.get(this.buildKey(walletAddress, chainId));
    return value ? (JSON.parse(value) as StoredChallenge) : null;
  }

  async clear(walletAddress: string, chainId: number): Promise<void> {
    await this.redisService.del(this.buildKey(walletAddress, chainId));
  }
}
