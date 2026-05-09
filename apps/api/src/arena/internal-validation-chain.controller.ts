import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { SystemRole } from "@arena/shared";

import { Roles } from "../common/decorators/roles.decorator";
import type { RequestWithUser } from "../common/interfaces/request-with-user.interface";
import { InternalValidationChainCancelMarketDto } from "./dto/internal-validation-chain-cancel-market.dto";
import { InternalValidationChainCommandDto } from "./dto/internal-validation-chain-command.dto";
import { InternalValidationChainPauseDto } from "./dto/internal-validation-chain-pause.dto";
import { ValidationChainOperatorCommandService } from "./validation-chain/validation-chain-operator-command.service";
import { ValidationChainOracleService } from "./validation-chain/validation-chain-oracle.service";
import { ValidationChainPauserService } from "./validation-chain/validation-chain-pauser.service";

@Controller("arena/internal/validation-chain")
export class ArenaInternalValidationChainController {
  constructor(
    private readonly commands: ValidationChainOperatorCommandService,
    private readonly oracle: ValidationChainOracleService,
    private readonly pauser: ValidationChainPauserService,
  ) {}

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/create-market")
  createMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.createMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/open-market")
  openMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.openMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/freeze-market")
  freezeMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.freezeMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/resolve-market")
  resolveMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCommandDto,
    @Req() request: RequestWithUser,
  ) {
    return this.oracle.resolveMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Operator, SystemRole.Admin, SystemRole.System)
  @Post("propositions/:propositionId/cancel-market")
  cancelMarket(
    @Param("propositionId") propositionId: string,
    @Body() body: InternalValidationChainCancelMarketDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commands.cancelMarket({
      propositionId,
      actorUserId: request.user?.sub,
      reason: body.reason,
      note: body.note,
      reasonCode: body.reasonCode,
    });
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("pause")
  pauseValidationChain(
    @Body() body: InternalValidationChainPauseDto,
    @Req() request: RequestWithUser,
  ) {
    return this.pauser.pauseValidationChain({
      actorUserId: request.user?.sub as string,
      reason: body.reason,
      note: body.note,
    });
  }

  @Roles(SystemRole.Admin, SystemRole.System)
  @Post("unpause")
  unpauseValidationChain(
    @Body() body: InternalValidationChainPauseDto,
    @Req() request: RequestWithUser,
  ) {
    return this.pauser.unpauseValidationChain({
      actorUserId: request.user?.sub as string,
      reason: body.reason,
      note: body.note,
    });
  }
}
