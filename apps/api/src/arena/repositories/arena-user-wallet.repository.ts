import { Injectable } from "@nestjs/common";
import type { Prisma, UserWallet } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import type { ArenaDbClient } from "../prisma.types";

@Injectable()
export class ArenaUserWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByWalletAddress(
    normalizedWalletAddress: string,
    chainId: number,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserWallet | null> {
    return db.userWallet.findUnique({
      where: {
        normalizedWalletAddress_chainId: {
          normalizedWalletAddress,
          chainId,
        },
      },
    });
  }

  async create(
    data: Prisma.UserWalletUncheckedCreateInput,
    db: ArenaDbClient = this.prisma,
  ): Promise<UserWallet> {
    return db.userWallet.create({ data });
  }
}
