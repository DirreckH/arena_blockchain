import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const WORKSPACE_MARKER = "pnpm-workspace.yaml";
const REPO_ROOT_SENTINELS = ["hardhat.config.js", "hardhat.config.cjs"];

function isWorkspaceRoot(dir: string): boolean {
  return existsSync(join(dir, WORKSPACE_MARKER));
}

function isRepositoryRoot(dir: string): boolean {
  if (!existsSync(join(dir, "package.json"))) {
    return false;
  }

  if (existsSync(join(dir, "contracts"))) {
    return true;
  }

  return REPO_ROOT_SENTINELS.some((sentinel) => existsSync(join(dir, sentinel)));
}

export function resolveWorkspaceRoot(startDir: string = process.cwd()): string {
  let currentDir = resolve(startDir);
  let fallbackRoot: string | null = null;

  while (true) {
    if (isWorkspaceRoot(currentDir)) {
      return currentDir;
    }

    if (!fallbackRoot && isRepositoryRoot(currentDir)) {
      fallbackRoot = currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  if (fallbackRoot) {
    return fallbackRoot;
  }

  throw new Error("Unable to resolve workspace root from current directory");
}

export function resolveFromWorkspaceRoot(...segments: string[]): string {
  return join(resolveWorkspaceRoot(), ...segments);
}
