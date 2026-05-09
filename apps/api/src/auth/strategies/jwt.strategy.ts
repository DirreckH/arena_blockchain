import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { expandSystemRoles } from "@arena/shared";

import type { JwtIdentity } from "@arena/shared";

import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: AppConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  validate(payload: JwtIdentity): JwtIdentity {
    return {
      ...payload,
      roles: expandSystemRoles(payload.roles),
    };
  }
}
