export interface AuthChallengeRequest {
  walletAddress: string;
  chainId: number;
}

export interface AuthChallengeResponse {
  walletAddress: string;
  chainId: number;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface AuthVerifyRequest {
  walletAddress: string;
  chainId: number;
  signature: string;
}

export enum SystemRole {
  User = "user",
  Operator = "operator",
  Admin = "admin",
  System = "system",
}

export interface JwtIdentity {
  sub: string;
  walletAddress: string;
  chainId: number;
  roles: SystemRole[];
}

const ROLE_EXPANSION: Record<SystemRole, readonly SystemRole[]> = {
  [SystemRole.User]: [SystemRole.User],
  [SystemRole.Operator]: [SystemRole.Operator, SystemRole.User],
  [SystemRole.Admin]: [SystemRole.Admin, SystemRole.Operator, SystemRole.User],
  [SystemRole.System]: [
    SystemRole.System,
    SystemRole.Admin,
    SystemRole.Operator,
    SystemRole.User,
  ],
};

export function expandSystemRoles(
  roles: readonly SystemRole[] | undefined,
): SystemRole[] {
  const sourceRoles =
    roles && roles.length > 0 ? roles : [SystemRole.User];
  const expanded = new Set<SystemRole>();

  for (const role of sourceRoles) {
    for (const inheritedRole of ROLE_EXPANSION[role] ?? [role]) {
      expanded.add(inheritedRole);
    }
  }

  return Array.from(expanded);
}

export function hasAnySystemRole(
  assignedRoles: readonly SystemRole[] | undefined,
  requiredRoles: readonly SystemRole[],
): boolean {
  const normalizedAssignedRoles = new Set(expandSystemRoles(assignedRoles));
  return requiredRoles.some((role) => normalizedAssignedRoles.has(role));
}
