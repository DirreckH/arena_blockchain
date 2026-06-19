import { Injectable } from "@nestjs/common";
import type { Prisma, User } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class ArenaUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<User | null> {
    return db.user.findUnique({
      where: { id: userId },
    });
  }

  async findByNormalizedPrimaryWalletAddress(
    normalizedPrimaryWalletAddress: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<User | null> {
    return db.user.findUnique({
      where: {
        normalizedPrimaryWalletAddress,
      },
    });
  }

  async create(
    data: Prisma.UserUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<User> {
    return db.user.create({ data });
  }

  async updatePrimaryWalletAddress(
    userId: string,
    walletAddress: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<User> {
    return db.user.update({
      where: { id: userId },
      data: {
        primaryWalletAddress: walletAddress,
        normalizedPrimaryWalletAddress: walletAddress.toLowerCase(),
      },
    });
  }

  async touchLastLogin(
    userId: string,
    db: ArenaDbClient = this.prisma,
  ): Promise<User> {
    return db.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async findByIds(
    userIds: string[],
    db: ArenaDbClient = this.prisma,
  ): Promise<User[]> {
    if (userIds.length === 0) {
      return [];
    }

    return db.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });
  }
}
