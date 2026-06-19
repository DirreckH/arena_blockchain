#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { ethers } = require("ethers");

const {
  addressFromPrivateKey,
  fail,
  info,
  pass,
} = require("./_validation-common.cjs");

const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "ARENA_INTERNAL_API_BASE_URL",
  "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN",
  "RPC_URL",
  "ARENA_CONTRACT_ADDRESS",
  "ARENA_VALIDATION_CONTRACT_ADDRESS",
  "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY",
  "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY",
  "ARENA_VALIDATION_ORACLE_PRIVATE_KEY",
  "ARENA_VALIDATION_PAUSER_PRIVATE_KEY",
  "ARENA_REWARD_PAYOUT_ERC20_ADDRESS",
  "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY",
  "ARENA_OPS_ALERT_WEBHOOK_TARGETS",
  "ARENA_OPS_ALERT_WEBHOOK_BEARER_TOKENS",
];

function parseArgs(argv) {
  const cwd = process.cwd();
  return argv.reduce(
    (options, argument, index) => {
      if (argument === "--staging-env") {
        options.stagingEnvPath = path.resolve(cwd, argv[index + 1]);
        options._skipNext = true;
        return options;
      }

      if (argument === "--previous-env") {
        options.previousEnvPath = path.resolve(cwd, argv[index + 1]);
        options._skipNext = true;
        return options;
      }

      if (argument === "--output") {
        options.outputPath = path.resolve(cwd, argv[index + 1]);
        options._skipNext = true;
        return options;
      }

      if (argument === "--closure-status") {
        options.closureStatusPath = path.resolve(cwd, argv[index + 1]);
        options._skipNext = true;
        return options;
      }

      if (argument === "--validation-network") {
        options.validationNetwork = String(argv[index + 1] || "").trim();
        options._skipNext = true;
        return options;
      }

      if (argument === "--force") {
        options.force = true;
        return options;
      }

      if (argument === "--probe-public-hosts") {
        options.probePublicHosts = true;
        return options;
      }

      if (argument === "--apply-recommended-base-url") {
        options.applyRecommendedBaseUrl = true;
        return options;
      }

      if (options._skipNext) {
        options._skipNext = false;
        return options;
      }

      throw new Error(`Unknown argument: ${argument}`);
    },
    {
      closureStatusPath: path.resolve(cwd, "validation-local", "closure-status.json"),
      applyRecommendedBaseUrl: false,
      force: false,
      outputPath: path.resolve(cwd, "config", "staging.closure-inputs.json"),
      previousEnvPath: path.resolve(cwd, "config", "staging.previous.env"),
      probePublicHosts: false,
      stagingEnvPath: path.resolve(cwd, "config", "staging.env"),
      validationNetwork: "validation",
    },
  );
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function updateEnvFileValueIfMissing(filePath, key, value) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const normalizedValue = typeof value === "string" ? value.trim() : "";
  if (!normalizedValue) {
    return false;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  let updated = false;
  let found = false;

  const nextLines = lines.map((line) => {
    if (!line.startsWith(`${key}=`)) {
      return line;
    }

    found = true;
    const currentValue = line.slice(key.length + 1).trim();
    if (hasMeaningfulValue(currentValue)) {
      return line;
    }

    updated = true;
    return `${key}=${normalizedValue}`;
  });

  if (!found) {
    nextLines.push(`${key}=${normalizedValue}`);
    updated = true;
  }

  if (!updated) {
    return false;
  }

  fs.writeFileSync(filePath, `${nextLines.join("\n").replace(/\n*$/u, "\n")}`, "utf8");
  return true;
}

function copyTemplateIfMissing(templatePath, targetPath, force) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found at ${templatePath}.`);
  }

  if (fs.existsSync(targetPath) && !force) {
    return false;
  }

  ensureParentDirectory(targetPath);
  fs.copyFileSync(templatePath, targetPath);
  return true;
}

function buildCommandParts(parts) {
  return parts.join(" ");
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function hasMeaningfulValue(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return !/^<.+>$/u.test(normalized) && !/^(todo|changeme|replace-me)$/iu.test(normalized);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value)));
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "host.docker.internal" ||
    normalized === "::1"
  );
}

function uniqueByOrigin(candidates) {
  const result = [];
  const seen = new Set();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const origin = String(candidate?.origin || "").trim();
    if (!origin || seen.has(origin)) {
      continue;
    }

    seen.add(origin);
    result.push(candidate);
  }

  return result;
}

function collectMissingEnvKeys(filePath, requiredKeys) {
  const envValues = parseEnvFile(filePath);
  return requiredKeys.filter((key) => !hasMeaningfulValue(envValues[key]));
}

function readGitRemoteOrigin(cwd, execFileSyncImpl = execFileSync) {
  try {
    const output = execFileSyncImpl("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return String(output || "").trim();
  } catch {
    return "";
  }
}

function parseGitHubRepositoryFromOrigin(originUrl) {
  if (typeof originUrl !== "string" || originUrl.trim().length === 0) {
    return null;
  }

  const normalizedOrigin = originUrl.trim();
  const httpsMatch = normalizedOrigin.match(
    /^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/iu,
  );
  if (httpsMatch?.groups) {
    return {
      owner: httpsMatch.groups.owner,
      repo: httpsMatch.groups.repo,
      fullName: `${httpsMatch.groups.owner}/${httpsMatch.groups.repo}`,
      originUrl: normalizedOrigin,
    };
  }

  const sshMatch = normalizedOrigin.match(
    /^(?:git@github\.com:|ssh:\/\/git@github\.com\/)(?<owner>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/iu,
  );
  if (sshMatch?.groups) {
    return {
      owner: sshMatch.groups.owner,
      repo: sshMatch.groups.repo,
      fullName: `${sshMatch.groups.owner}/${sshMatch.groups.repo}`,
      originUrl: normalizedOrigin,
    };
  }

  return null;
}

async function fetchJsonOrNull(fetchImpl, url, options = {}) {
  try {
    const response = await fetchImpl(url, {
      headers: options.headers,
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(options.timeoutMs || 15000)
          : undefined,
    });
    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!/^https?:$/u.test(url.protocol)) {
      return null;
    }

    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function addCandidateSource(map, origin, source) {
  if (!origin) {
    return;
  }

  const existing = map.get(origin);
  if (!existing) {
    const url = new URL(origin);
    map.set(origin, {
      hostname: url.hostname,
      origin,
      sources: [source],
    });
    return;
  }

  existing.sources.push(source);
}

async function probeUrl(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(10000)
          : undefined,
    });

    return {
      ok: response.ok,
      redirected: response.redirected === true,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      redirected: false,
      statusCode: null,
    };
  }
}

async function fetchText(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(15000)
          : undefined,
    });

    if (!response.ok) {
      return null;
    }

    return response.text();
  } catch {
    return null;
  }
}

function probeUrlViaPowershell(url, spawnSyncImpl = spawnSync) {
  const escapedUrl = String(url).replace(/'/gu, "''");
  const script = `
$ProgressPreference='SilentlyContinue'
try {
  $r = Invoke-WebRequest -Method Get -Uri '${escapedUrl}' -MaximumRedirection 5 -TimeoutSec 20
  [pscustomobject]@{ StatusCode=[int]$r.StatusCode } | ConvertTo-Json -Compress
}
catch {
  $resp = $_.Exception.Response
  if ($resp) {
    [pscustomobject]@{ StatusCode=[int]$resp.StatusCode } | ConvertTo-Json -Compress
  }
  else {
    [pscustomobject]@{ Error=$_.Exception.Message } | ConvertTo-Json -Compress
  }
}
  `.trim();

  const result = spawnSyncImpl(
    "powershell",
    ["-NoLogo", "-NoProfile", "-Command", script],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    },
  );

  if (!result || result.status !== 0 || !result.stdout) {
    return null;
  }

  try {
    const parsed = JSON.parse(String(result.stdout).trim());
    return {
      error: parsed.Error || null,
      ok:
        typeof parsed.StatusCode === "number" &&
        parsed.StatusCode >= 200 &&
        parsed.StatusCode < 400,
      redirected: false,
      statusCode:
        typeof parsed.StatusCode === "number" ? parsed.StatusCode : null,
    };
  } catch {
    return null;
  }
}

function fetchTextViaPowershell(url, spawnSyncImpl = spawnSync) {
  const escapedUrl = String(url).replace(/'/gu, "''");
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference='SilentlyContinue'
try {
  $r = Invoke-WebRequest -Method Get -Uri '${escapedUrl}' -MaximumRedirection 5 -TimeoutSec 20
  Write-Output $r.Content
}
catch {
  exit 1
}
  `.trim();

  const result = spawnSyncImpl(
    "powershell",
    ["-NoLogo", "-NoProfile", "-Command", script],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    },
  );

  if (!result || result.status !== 0) {
    return null;
  }

  return typeof result.stdout === "string" && result.stdout.length > 0
    ? result.stdout
    : null;
}

async function probeUrlWithFallback(fetchImpl, url, options = {}) {
  if (options.preferShellProbe === true && process.platform === "win32") {
    const shellProbe = probeUrlViaPowershell(url, options.spawnSyncImpl);
    if (shellProbe) {
      return shellProbe;
    }
  }

  const primaryProbe = await probeUrl(fetchImpl, url);
  if (
    primaryProbe.statusCode !== null ||
    options.allowShellProbeFallback !== true ||
    process.platform !== "win32"
  ) {
    return primaryProbe;
  }

  return probeUrlViaPowershell(url, options.spawnSyncImpl) || primaryProbe;
}

async function fetchTextWithFallback(fetchImpl, url, options = {}) {
  if (options.preferShellProbe === true && process.platform === "win32") {
    const shellText = fetchTextViaPowershell(url, options.spawnSyncImpl);
    if (typeof shellText === "string" && shellText.length > 0) {
      return shellText;
    }
  }

  const primaryText = await fetchText(fetchImpl, url);
  if (
    primaryText !== null ||
    options.allowShellProbeFallback !== true ||
    process.platform !== "win32"
  ) {
    return primaryText;
  }

  return fetchTextViaPowershell(url, options.spawnSyncImpl);
}

function classifyBaseUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { hostname: null, isLocal: false, normalized: null };
  }

  try {
    const parsed = new URL(value);
    return {
      hostname: parsed.hostname.toLowerCase(),
      isLocal: isLocalHostname(parsed.hostname),
      normalized: `${parsed.protocol}//${parsed.host}`,
    };
  } catch {
    return { hostname: null, isLocal: false, normalized: null };
  }
}

function isVercelProtectedHost(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  return normalized.endsWith(".vercel.app") || normalized === "vercel.app";
}

async function probeBaseUrlAccess(options = {}) {
  const baseUrl = stripTrailingSlash(options.baseUrl || "");
  const baseUrlInfo = classifyBaseUrl(baseUrl);

  if (!baseUrl || baseUrlInfo.isLocal) {
    return null;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const probe = await probeUrlWithFallback(fetchImpl, `${baseUrl}/health/live`, {
    allowShellProbeFallback: true,
    preferShellProbe: process.platform === "win32" && !options.fetchImpl,
    spawnSyncImpl: options.spawnSyncImpl,
  });

  if (probe.statusCode === null) {
    return {
      protection: null,
      statusCode: null,
      url: `${baseUrl}/health/live`,
    };
  }

  return {
    protection:
      (probe.statusCode === 401 || probe.statusCode === 403) &&
      isVercelProtectedHost(baseUrlInfo.hostname)
        ? "vercel_deployment_protection_required"
        : null,
    statusCode: probe.statusCode,
    url: `${baseUrl}/health/live`,
  };
}

function buildProbeStatusSnapshot(probes) {
  return {
    healthLiveStatusCode: probes.healthLive?.statusCode ?? null,
    internalRuntimeContractStatusCode:
      probes.internalRuntimeContract?.statusCode ?? null,
    publicSettledResultsStatusCode:
      probes.publicSettledResults?.statusCode ?? null,
    rootStatusCode: probes.root?.statusCode ?? null,
  };
}

function classifyCandidateFromSources(candidate) {
  const hasSuccessfulDeploymentSource = candidate.sources.some(
    (source) =>
      source.source === "github_deployment_status" && source.state === "success",
  );
  const hasHomepageSource = candidate.sources.some(
    (source) => source.source === "github_repository_homepage",
  );

  if (hasSuccessfulDeploymentSource) {
    return "deployment_candidate_requires_access_and_api_route_verification";
  }

  if (hasHomepageSource) {
    return "homepage_candidate_requires_api_route_verification";
  }

  return "candidate_requires_manual_verification";
}

function resolveBundleUrl(origin, assetPath) {
  if (typeof assetPath !== "string" || assetPath.trim().length === 0) {
    return null;
  }

  try {
    return new URL(assetPath, `${origin}/`).toString();
  } catch {
    return null;
  }
}

function extractBundleUrlFromHtml(origin, html) {
  if (typeof html !== "string" || html.length === 0) {
    return null;
  }

  const directMatch = html.match(/src="([^"]+assets\/[^"]+\.js)"/u);
  if (!directMatch?.[1]) {
    return null;
  }

  return resolveBundleUrl(origin, directMatch[1]);
}

function inspectBundleText(bundleText) {
  if (typeof bundleText !== "string" || bundleText.length === 0) {
    return null;
  }

  const localApiMatch = bundleText.match(
    /https?:\/\/(?:127\.0\.0\.1|localhost):\d+/u,
  );

  return {
    defaultLocalApiBaseUrl: localApiMatch?.[0] || null,
    usesViteApiBaseEnv: bundleText.includes("VITE_API_BASE_URL"),
  };
}

async function inspectFrontendBundle(fetchImpl, origin, options = {}) {
  const html = await fetchTextWithFallback(fetchImpl, origin, options);
  if (typeof html !== "string" || html.length === 0) {
    return null;
  }

  const bundleUrl = extractBundleUrlFromHtml(origin, html);
  if (!bundleUrl) {
    return {
      bundleUrl: null,
      defaultLocalApiBaseUrl: null,
      usesViteApiBaseEnv: false,
    };
  }

  const bundleText = await fetchTextWithFallback(fetchImpl, bundleUrl, options);
  const bundleInspection = inspectBundleText(bundleText);

  return {
    bundleUrl,
    defaultLocalApiBaseUrl:
      bundleInspection?.defaultLocalApiBaseUrl || null,
    usesViteApiBaseEnv: bundleInspection?.usesViteApiBaseEnv === true,
  };
}

function readLatestCandidateSourceTimestamp(candidate) {
  const timestamps = candidate.sources
    .map((source) => Date.parse(source.createdAt || ""))
    .filter((value) => Number.isFinite(value));

  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function chooseRecommendedBaseUrlCandidate(candidates) {
  const candidateList = Array.isArray(candidates) ? candidates : [];
  const apiDetectedCandidate = candidateList
    .filter((candidate) => candidate.suitability === "api_routes_detected")
    .sort(
      (left, right) =>
        readLatestCandidateSourceTimestamp(right) -
        readLatestCandidateSourceTimestamp(left),
    )[0];

  if (apiDetectedCandidate) {
    return {
      confidence: "high",
      origin: apiDetectedCandidate.origin,
      reason:
        "public api routes responded without authentication during discovery",
      suitability: apiDetectedCandidate.suitability,
    };
  }

  const protectedProductionCandidate = candidateList
    .filter(
      (candidate) =>
        candidate.suitability ===
          "protected_candidate_manual_verification_required" &&
        candidate.sources.some(
          (source) =>
            source.source === "github_deployment_status" &&
            source.environment === "Production" &&
            source.state === "success",
        ),
    )
    .sort(
      (left, right) =>
        readLatestCandidateSourceTimestamp(right) -
        readLatestCandidateSourceTimestamp(left),
    )[0];

  if (protectedProductionCandidate) {
    return {
      confidence: "medium",
      origin: protectedProductionCandidate.origin,
      reason:
        "latest successful public Production deployment is protected (401) and is the strongest backend/staging candidate discovered without credentials",
      suitability: protectedProductionCandidate.suitability,
    };
  }

  return null;
}

function classifyBaseUrlCandidate(probes, bundleInspection = null) {
  const publicRouteOk =
    typeof probes.publicSettledResults?.statusCode === "number" &&
    probes.publicSettledResults.statusCode >= 200 &&
    probes.publicSettledResults.statusCode < 400;
  const publicRouteProtected =
    probes.publicSettledResults?.statusCode === 401 ||
    probes.publicSettledResults?.statusCode === 403;
  const rootProtected =
    probes.root?.statusCode === 401 || probes.root?.statusCode === 403;
  const rootOk =
    typeof probes.root?.statusCode === "number" &&
    probes.root.statusCode >= 200 &&
    probes.root.statusCode < 400;
  const publicRouteMissing = probes.publicSettledResults?.statusCode === 404;

  if (publicRouteOk && (rootProtected || rootOk)) {
    return "api_routes_detected";
  }

  if (rootProtected || publicRouteProtected) {
    return "protected_candidate_manual_verification_required";
  }

  if (
    rootOk &&
    publicRouteMissing &&
    bundleInspection?.defaultLocalApiBaseUrl
  ) {
    return "frontend_bundle_uses_local_api_default";
  }

  if (rootOk && publicRouteMissing) {
    return "frontend_only_not_backend_api";
  }

  if (probes.root?.error || probes.publicSettledResults?.error) {
    return "unverified_network_probe";
  }

  return "manual_verification_required";
}

async function discoverPublicDeploymentCandidates(options = {}) {
  const cwd = options.cwd || process.cwd();
  const fetchImpl = options.fetchImpl || fetch;
  const execFileSyncImpl = options.execFileSyncImpl || execFileSync;
  const allowShellProbeFallback = !options.fetchImpl;
  const preferShellProbe = allowShellProbeFallback && process.platform === "win32";
  const probePublicHosts = options.probePublicHosts === true;
  const requestHeaders = {
    Accept: "application/vnd.github+json",
    "User-Agent": "arena-closure-inputs",
  };
  const warnings = [];
  const originUrl = readGitRemoteOrigin(cwd, execFileSyncImpl);
  const repositoryRef = parseGitHubRepositoryFromOrigin(originUrl);

  if (!repositoryRef) {
    return {
      baseUrlCandidates: [],
      repository: null,
      warnings: uniqueStrings([
        ...warnings,
        originUrl
          ? `Unsupported git origin for public discovery: ${originUrl}`
          : "Git origin not available for public discovery.",
      ]),
    };
  }

  const repository = {
    environments: [],
    fullName: repositoryRef.fullName,
    homepageUrl: null,
    htmlUrl: `https://github.com/${repositoryRef.fullName}`,
    originUrl: repositoryRef.originUrl,
  };

  const repoApiBase = `https://api.github.com/repos/${repositoryRef.fullName}`;
  const repoMetadata = await fetchJsonOrNull(fetchImpl, repoApiBase, {
    headers: requestHeaders,
  });
  if (repoMetadata) {
    repository.homepageUrl = normalizeOrigin(repoMetadata.homepage || "") || repoMetadata.homepage || null;
    repository.htmlUrl = repoMetadata.html_url || repository.htmlUrl;
  } else {
    warnings.push(`Unable to fetch public repository metadata from ${repoApiBase}.`);
  }

  const environments = await fetchJsonOrNull(fetchImpl, `${repoApiBase}/environments`, {
    headers: requestHeaders,
  });
  if (environments?.environments) {
    repository.environments = environments.environments.map((environment) => ({
      createdAt: environment.created_at || null,
      htmlUrl: environment.html_url || null,
      name: environment.name || null,
      updatedAt: environment.updated_at || null,
    }));
  }

  const deployments = await fetchJsonOrNull(fetchImpl, `${repoApiBase}/deployments?per_page=10`, {
    headers: requestHeaders,
  });
  const candidateMap = new Map();

  if (repository.homepageUrl) {
    const homepageOrigin = normalizeOrigin(repository.homepageUrl);
    addCandidateSource(candidateMap, homepageOrigin, {
      source: "github_repository_homepage",
      url: repository.homepageUrl,
    });
  }

  for (const deployment of asArray(deployments).slice(0, 6)) {
    if (!deployment?.statuses_url) {
      continue;
    }

    const statusPayload = await fetchJsonOrNull(fetchImpl, deployment.statuses_url, {
      headers: requestHeaders,
    });
    const latestStatus = asArray(statusPayload)[0];
    if (latestStatus?.state && latestStatus.state !== "success") {
      continue;
    }
    const deploymentOrigin = normalizeOrigin(
      latestStatus?.environment_url ||
        latestStatus?.target_url ||
        deployment?.payload?.web_url ||
        "",
    );

    if (!deploymentOrigin) {
      continue;
    }

    addCandidateSource(candidateMap, deploymentOrigin, {
      createdAt: latestStatus?.created_at || deployment.created_at || null,
      deploymentId: deployment.id || null,
      environment: latestStatus?.environment || deployment.environment || null,
      state: latestStatus?.state || null,
      statusUrl: deployment.statuses_url,
      source: "github_deployment_status",
      targetUrl: latestStatus?.target_url || null,
    });
  }

  const baseUrlCandidates = await Promise.all(
    Array.from(candidateMap.values()).map(async (candidate) => {
      if (!probePublicHosts) {
        return {
          ...candidate,
          suitability: classifyCandidateFromSources(candidate),
          unauthenticatedProbe: buildProbeStatusSnapshot({
            healthLive: {},
            internalRuntimeContract: {},
            publicSettledResults: {},
            root: {},
          }),
        };
      }

      const [root, publicSettledResults] = await Promise.all([
        probeUrlWithFallback(fetchImpl, candidate.origin, {
          allowShellProbeFallback,
          preferShellProbe,
          spawnSyncImpl: options.spawnSyncImpl,
        }),
        probeUrlWithFallback(
          fetchImpl,
          `${candidate.origin}/arena/public/results/settled`,
          {
            allowShellProbeFallback,
            preferShellProbe,
            spawnSyncImpl: options.spawnSyncImpl,
          },
        ),
      ]);
      const probes = {
        healthLive: { statusCode: null },
        internalRuntimeContract: { statusCode: null },
        publicSettledResults,
        root,
      };
      const bundleInspection =
        probes.root.statusCode === 200
          ? await inspectFrontendBundle(fetchImpl, candidate.origin, {
              allowShellProbeFallback,
              preferShellProbe,
              spawnSyncImpl: options.spawnSyncImpl,
            })
          : null;

      return {
        ...candidate,
        bundleInspection,
        suitability: classifyBaseUrlCandidate(probes, bundleInspection),
        unauthenticatedProbe: buildProbeStatusSnapshot(probes),
      };
    }),
  );

  return {
    baseUrlCandidates,
    repository,
    warnings: uniqueStrings(warnings),
  };
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/u, "");
}

async function discoverLivePropositionCandidates(options = {}) {
  const baseUrl = stripTrailingSlash(options.baseUrl || "");
  const authToken = String(options.authToken || "").trim();
  const fetchImpl = options.fetchImpl || fetch;
  const allowShellFallback =
    options.allowShellFallback === true || process.platform === "win32";
  const spawnSyncImpl = options.spawnSyncImpl || spawnSync;

  if (!baseUrl || !authToken) {
    return {
      candidates: [],
      warnings: [],
    };
  }

  const url = `${baseUrl}/arena/internal/propositions?limit=5&sortBy=createdAt&sortDirection=desc`;
  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
      method: "GET",
    });
  } catch (error) {
    if (allowShellFallback) {
      const shellResponse = discoverLivePropositionCandidatesViaPowershell({
        authToken,
        baseUrl,
        spawnSyncImpl,
      });
      if (shellResponse) {
        return shellResponse;
      }
    }

    return {
      candidates: [],
      warnings: [
        `Unable to discover live proposition candidates from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  if ((!response || !response.ok) && allowShellFallback) {
    const shellResponse = discoverLivePropositionCandidatesViaPowershell({
      authToken,
      baseUrl,
      spawnSyncImpl,
    });
    if (shellResponse) {
      return shellResponse;
    }
  }

  if (!response.ok) {
    return {
      candidates: [],
      warnings: [
        `Unable to discover live proposition candidates from ${url}: HTTP ${response.status}`,
      ],
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return {
      candidates: [],
      warnings: [
        `Unable to parse live proposition candidate payload from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const candidates = Array.isArray(payload?.items)
    ? payload.items
        .map((item) => {
          const propositionId = String(item?.propositionId || item?.id || "").trim();
          if (!propositionId) {
            return null;
          }

          return {
            createdAt: typeof item?.createdAt === "string" ? item.createdAt : null,
            propositionId,
            source: "live_internal_listing",
            status: typeof item?.status === "string" ? item.status : null,
            suitability: "live_staging_candidate",
            title: typeof item?.title === "string" ? item.title : null,
          };
        })
        .filter(Boolean)
    : [];

  return {
    candidates,
    warnings: [],
  };
}

function discoverLivePropositionCandidatesViaPowershell(options) {
  const baseUrl = stripTrailingSlash(options.baseUrl || "");
  const authToken = String(options.authToken || "").trim();
  const escapedUrl = `${baseUrl}/arena/internal/propositions?limit=5&sortBy=createdAt&sortDirection=desc`.replace(/'/gu, "''");
  const escapedToken = authToken.replace(/'/gu, "''");

  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference='SilentlyContinue'
try {
  $r = Invoke-WebRequest -Method Get -Uri '${escapedUrl}' -Headers @{ authorization = 'Bearer ${escapedToken}' } -TimeoutSec 20
  if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) {
    Write-Output $r.Content
  }
  else {
    exit 2
  }
}
catch {
  exit 1
}
  `.trim();

  const result = options.spawnSyncImpl("powershell", ["-NoLogo", "-NoProfile", "-Command", script], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });

  if (!result || result.status !== 0 || !result.stdout) {
    return null;
  }

  try {
    const payload = JSON.parse(String(result.stdout));
    const candidates = Array.isArray(payload?.items)
      ? payload.items
          .map((item) => {
            const propositionId = String(item?.propositionId || item?.id || "").trim();
            if (!propositionId) {
              return null;
            }

            return {
              createdAt: typeof item?.createdAt === "string" ? item.createdAt : null,
              propositionId,
              source: "live_internal_listing",
              status: typeof item?.status === "string" ? item.status : null,
              suitability: "live_staging_candidate",
              title: typeof item?.title === "string" ? item.title : null,
            };
          })
          .filter(Boolean)
      : [];

    return {
      candidates,
      warnings: [],
    };
  } catch {
    return null;
  }
}

function buildRequiredValueSummary(options) {
  const currentEnvMissingKeys = collectMissingEnvKeys(
    options.stagingEnvPath,
    REQUIRED_ENV_KEYS,
  );
  const previousEnvMissingKeys = collectMissingEnvKeys(
    options.previousEnvPath,
    REQUIRED_ENV_KEYS,
  );
  const runtimeInputsMissing = [];

  if (!hasMeaningfulValue(options.baseUrl)) {
    runtimeInputsMissing.push("baseUrl");
  }
  if (!hasMeaningfulValue(options.propositionId)) {
    runtimeInputsMissing.push("propositionId");
  }

  return {
    currentEnvMissingKeys,
    previousEnvMissingKeys,
    runtimeInputsMissing,
    outstandingRequiredValues: uniqueStrings([
      ...currentEnvMissingKeys,
      ...previousEnvMissingKeys,
      ...runtimeInputsMissing,
    ]),
  };
}

function deriveBaseUrlMaterialStatus(options = {}) {
  const baseUrl = String(options.baseUrl || "").trim();
  const recommendedOrigin = String(options.recommendedBaseUrlOrigin || "").trim();

  if (!hasMeaningfulValue(baseUrl)) {
    return hasMeaningfulValue(recommendedOrigin)
      ? "candidate_discovered_manual_verification_required"
      : "missing";
  }

  if (hasMeaningfulValue(recommendedOrigin) && baseUrl === recommendedOrigin) {
    return "candidate_applied_manual_verification_required";
  }

  return "present_manual_verification_required";
}

function deriveBaseUrlManifestStatus(options = {}) {
  const materialStatus = deriveBaseUrlMaterialStatus(options);

  if (materialStatus === "candidate_applied_manual_verification_required") {
    return "recommended_candidate_applied_to_current_env_manual_verification_required";
  }

  if (materialStatus === "candidate_discovered_manual_verification_required") {
    return "candidate_values_discovered_manual_verification_required";
  }

  if (materialStatus === "present_manual_verification_required") {
    return "provided_in_env_manual_verification_required";
  }

  return "required_real_value";
}

function readCleanHostIdentityProofFromClosureStatus(closureStatus) {
  const taskStatus = closureStatus?.taskStatus?.N1 || null;
  const materialStatus = closureStatus?.requiredExternalMaterials?.cleanHostIdentityGate || null;

  if (taskStatus?.status !== "clean_host_verified" && materialStatus?.status !== "present") {
    return null;
  }

  const proof = materialStatus?.proof || null;
  if (!proof) {
    return {
      checkedAt: closureStatus?.checkedAt || null,
      consecutivePasses: null,
      requiredConsecutivePasses: null,
      runsCompleted: null,
      summaryPath: closureStatus?.existingArtifacts?.validationLocal?.identityCleanHostDockerSummary || null,
    };
  }

  return {
    checkedAt: proof.checkedAt || closureStatus?.checkedAt || null,
    consecutivePasses: proof.consecutivePasses ?? null,
    requiredConsecutivePasses: proof.requiredConsecutivePasses ?? null,
    runsCompleted: proof.runsCompleted ?? null,
    summaryPath:
      proof.summaryPath ||
      closureStatus?.existingArtifacts?.validationLocal?.identityCleanHostDockerSummary ||
      null,
  };
}
function buildProvidedBaseUrlCandidate(baseUrl) {
  const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!hasMeaningfulValue(normalizedBaseUrl)) {
    return null;
  }

  try {
    const parsed = new URL(normalizedBaseUrl);
    if (!/^https?:$/u.test(parsed.protocol) || isLocalHostname(parsed.hostname)) {
      return null;
    }

    return {
      confidence: "manual",
      origin: parsed.origin,
      reason: "current staging env already points at this non-local base URL",
      suitability: "provided_in_env_manual_verification_required",
    };
  } catch {
    return null;
  }
}

function buildClosureCriticalMaterials(options) {
  const recommendedBaseUrlCandidate = options.recommendedBaseUrlCandidate || null;
  const providedBaseUrlCandidate = options.providedBaseUrlCandidate || null;
  const effectiveBaseUrlCandidate = recommendedBaseUrlCandidate || providedBaseUrlCandidate;
  const recommendedBaseUrlOrigin = recommendedBaseUrlCandidate?.origin || "";
  const propositionIdCandidates = Array.isArray(options.propositionIdCandidates)
    ? options.propositionIdCandidates
    : [];
  const currentEnvMissingKeys = Array.isArray(options.currentEnvMissingKeys)
    ? options.currentEnvMissingKeys
    : [];
  const previousEnvMissingKeys = Array.isArray(options.previousEnvMissingKeys)
    ? options.previousEnvMissingKeys
    : [];
  const networkExecutionReadiness = options.networkExecutionReadiness || null;
  const signerChecks = Array.isArray(networkExecutionReadiness?.signerChecks)
    ? networkExecutionReadiness.signerChecks
    : [];
  const signerFundingPending = signerChecks.some((check) => check?.needsFunding === true);
  const cleanHostIdentityProof = readCleanHostIdentityProofFromClosureStatus(options.closureStatus);
  const baseUrlAccess = options.baseUrlAccess || null;
  const vercelAccessPresent = options.vercelAccessPresent === true;

  return {
    baseUrl: {
      acceptedInputs: [
        "--base-url <https://host>",
        "ARENA_INTERNAL_API_BASE_URL in the current release env file",
      ],
      candidate: effectiveBaseUrlCandidate,
      description:
        "Non-local staging or protected production-like API host used by release evidence and validation proof capture.",
      envFilePath: options.stagingEnvPath,
      envKey: "ARENA_INTERNAL_API_BASE_URL",
      id: "base_url",
      status: deriveBaseUrlMaterialStatus({
        baseUrl: options.baseUrl,
        recommendedBaseUrlOrigin,
      }),
      tasks: ["N2", "N4", "N8", "N10", "N11"],
      usedByCommands: [
        "pnpm run backend:release:evidence:external",
        "pnpm run validation:ops:brief",
        "pnpm run validation:proof:capture",
      ],
    },
    vercelAccess: {
      acceptedInputs: [
        "VERCEL_PROTECTION_BYPASS_TOKEN for x-vercel-protection-bypass",
        "VERCEL_TRUSTED_OIDC_TOKEN for x-vercel-trusted-oidc-idp-token",
      ],
      baseUrl: options.baseUrl || "",
      description:
        "Bypass credentials for protected staging endpoints used by non-interactive evidence capture.",
      envKeys: ["VERCEL_PROTECTION_BYPASS_TOKEN", "VERCEL_TRUSTED_OIDC_TOKEN"],
      id: "vercel_access",
      status:
        baseUrlAccess?.protection === "vercel_deployment_protection_required"
          ? vercelAccessPresent
            ? "present"
            : "missing"
          : "not_required",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
      usedByCommands: [
        "pnpm run backend:release:evidence:external",
        "pnpm run validation:ops:brief",
        "pnpm run validation:proof:capture",
      ],
    },
    operatorToken: {
      acceptedInputs: [
        "--auth-token <operator-token>",
        "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN in the current release env file",
      ],
      description:
        "Protected internal operator bearer token required by release evidence, validation proof capture, and operator monitoring proof.",
      envFilePath: options.stagingEnvPath,
      envKey: "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN",
      id: "operator_token",
      status: currentEnvMissingKeys.includes("ARENA_INTERNAL_OPERATOR_BEARER_TOKEN")
        ? "missing"
        : "present",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
      usedByCommands: [
        "pnpm run backend:release:evidence:external",
        "pnpm run backend:release:check",
        "pnpm run validation:ops:brief",
        "pnpm run validation:proof:capture",
      ],
    },
    rpcUrl: {
      acceptedInputs: [
        "RPC_URL in the current release env file",
        "Non-local validation-chain RPC endpoint for the selected network",
      ],
      description:
        "Validation-chain RPC used by deploy, preflight, and non-local chain-backed rehearsal or payout follow-through.",
      envFilePath: options.stagingEnvPath,
      envKey: "RPC_URL",
      id: "rpc_url",
      network: options.validationNetwork,
      status: currentEnvMissingKeys.includes("RPC_URL") ? "missing" : "present",
      tasks: ["N2", "N3", "N4"],
      usedByCommands: [
        "pnpm run validation:deploy",
        "pnpm run validation:preflight",
      ],
    },
    validationSignerFunding: {
      description:
        "Signer balances for deploy, operator, oracle, pauser, and payout execution on the selected non-local validation network.",
      id: "validation_signer_funding",
      network: networkExecutionReadiness?.network || null,
      signerChecks,
      status: signerChecks.length === 0
        ? "unknown"
        : signerFundingPending
          ? "pending_funding"
          : "funded",
      tasks: ["N2", "N3", "N4"],
      usedByCommands: [
        "pnpm run validation:deploy",
        "pnpm run validation:preflight",
        "pnpm run validation:chain:check",
      ],
    },
    propositionId: {
      acceptedInputs: [
        "--proposition-id <id>",
        "Real staging proposition suitable for proof capture and, ideally, payout follow-through",
      ],
      candidates: propositionIdCandidates,
      description:
        "Non-local proposition selected for the closure wave. Local proof ids are hints only and must be replaced with a real staging proposition.",
      id: "proposition_id",
      status: hasMeaningfulValue(options.propositionId)
        ? "complete"
        : propositionIdCandidates.length > 0
          ? "candidate_only"
          : "missing",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
      usedByCommands: [
        "pnpm run backend:release:evidence:external",
        "pnpm run validation:ops:brief",
        "pnpm run validation:proof:capture",
      ],
    },
    currentReleaseEnvCompleteness: {
      description:
        "Current release env must be fully populated before external deploy, rehearsal, payout, alerting, rollback, and secret-rotation proof can close.",
      envFilePath: options.stagingEnvPath,
      id: "current_release_env_completeness",
      missingKeys: currentEnvMissingKeys,
      status: currentEnvMissingKeys.length === 0 ? "complete" : "incomplete",
      tasks: ["N2", "N3", "N4", "N8", "N10", "N11"],
    },
    previousReleaseEnvCompleteness: {
      description:
        "Previous release env snapshot is required for fingerprint-safe secret rotation comparison evidence.",
      envFilePath: options.previousEnvPath,
      id: "previous_release_env_completeness",
      missingKeys: previousEnvMissingKeys,
      status: previousEnvMissingKeys.length === 0 ? "complete" : "incomplete",
      tasks: ["N11"],
      usedByCommands: ["pnpm run backend:secrets:rotate:check"],
    },
    cleanHostIdentityGate: {
      acceptance:
        "Run pnpm run api:test:identity 5 consecutive times on a clean VM or staging-capable host and archive the logs.",
      description:
        "N1 closes only after the canonical identity gate is stable on a clean host, not just on the current local Windows machine.",
      id: "clean_host_identity_gate",
      proof: cleanHostIdentityProof,
      status: cleanHostIdentityProof ? "present" : "pending_clean_host_proof",
      tasks: ["N1"],
      usedByCommands: ["pnpm run api:test:identity"],
    },
  };
}

async function inspectNetworkExecutionReadiness(options = {}) {
  const envValues = parseEnvFile(options.stagingEnvPath);
  const rpcUrl = String(envValues.RPC_URL || "").trim();
  if (!hasMeaningfulValue(rpcUrl)) {
    return null;
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signerKeys = [
    ["deployer", "ARENA_VALIDATION_DEPLOYER_PRIVATE_KEY"],
    ["operator", "ARENA_VALIDATION_OPERATOR_PRIVATE_KEY"],
    ["oracle", "ARENA_VALIDATION_ORACLE_PRIVATE_KEY"],
    ["pauser", "ARENA_VALIDATION_PAUSER_PRIVATE_KEY"],
    ["payout", "ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY"],
  ];

  try {
    const network = await provider.getNetwork();
    const signerChecks = [];

    for (const [label, keyName] of signerKeys) {
      const privateKey = String(envValues[keyName] || "").trim();
      if (!privateKey) {
        signerChecks.push({
          address: null,
          balanceEth: null,
          balanceWei: null,
          key: keyName,
          label,
          missingKey: true,
          needsFunding: true,
        });
        continue;
      }

      const address = addressFromPrivateKey(privateKey);
      const balance = await provider.getBalance(address);
      signerChecks.push({
        address,
        balanceEth: ethers.utils.formatEther(balance),
        balanceWei: balance.toString(),
        key: keyName,
        label,
        missingKey: false,
        needsFunding: balance.isZero(),
      });
    }

    return {
      network: {
        chainId: Number(network.chainId),
        name: network.name,
        rpcUrl,
      },
      signerChecks,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      network: null,
      signerChecks: [],
    };
  }
}

function buildManualActionChecklist(options) {
  const closureCriticalMaterials = options.closureCriticalMaterials || {};
  const checklist = [];

  if (closureCriticalMaterials.cleanHostIdentityGate?.status === "pending_clean_host_proof") {
    checklist.push({
      id: "clean_host_identity_gate",
      title: "Run clean-host identity gate 5 times",
      command: "pnpm run api:test:identity",
      details: "Archive 5 consecutive green runs on a clean VM or staging-capable host for N1 closure.",
      tasks: ["N1"],
    });
  }

  if (closureCriticalMaterials.validationSignerFunding?.status === "pending_funding") {
    checklist.push({
      id: "fund_validation_signers",
      title: "Fund Sepolia validation signers",
      network: closureCriticalMaterials.validationSignerFunding.network || null,
      signerChecks: closureCriticalMaterials.validationSignerFunding.signerChecks || [],
      details: "Provide native token funding before non-local deploy, preflight, or payout follow-through can start.",
      tasks: ["N2", "N3", "N4"],
    });
  }

  if ((closureCriticalMaterials.currentReleaseEnvCompleteness?.missingKeys || []).length > 0) {
    checklist.push({
      id: "fill_release_env_values",
      title: "Fill remaining current release env values",
      envFilePath: closureCriticalMaterials.currentReleaseEnvCompleteness.envFilePath,
      missingKeys: closureCriticalMaterials.currentReleaseEnvCompleteness.missingKeys,
      details: "Populate the remaining real non-local env values before deploy and external evidence commands.",
      tasks: ["N2", "N3", "N4", "N8", "N10", "N11"],
    });
  }

  if ((closureCriticalMaterials.previousReleaseEnvCompleteness?.missingKeys || []).length > 0) {
    checklist.push({
      id: "fill_previous_release_env_values",
      title: "Fill previous release env snapshot values",
      envFilePath: closureCriticalMaterials.previousReleaseEnvCompleteness.envFilePath,
      missingKeys: closureCriticalMaterials.previousReleaseEnvCompleteness.missingKeys,
      details: "Populate the previous release env snapshot so secret rotation evidence can compare current vs previous safely.",
      tasks: ["N11"],
    });
  }

  if (
    [
      "candidate_applied_manual_verification_required",
      "present_manual_verification_required",
      "candidate_discovered_manual_verification_required",
    ].includes(closureCriticalMaterials.baseUrl?.status)
  ) {
    checklist.push({
      id: "confirm_real_base_url",
      title: "Confirm real staging base URL",
      candidate: closureCriticalMaterials.baseUrl.candidate || null,
      details: "Replace or confirm the recommended public host with the actual operator-confirmed staging backend base URL.",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
    });
  }

  if (closureCriticalMaterials.vercelAccess?.status === "missing") {
    checklist.push({
      id: "vercel_access",
      title: "Provide Vercel access",
      baseUrl: closureCriticalMaterials.vercelAccess.baseUrl || null,
      envKeys: closureCriticalMaterials.vercelAccess.envKeys || [],
      details: "Provide either VERCEL_PROTECTION_BYPASS_TOKEN or VERCEL_TRUSTED_OIDC_TOKEN so protected staging endpoints can be reached non-interactively.",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
    });
  }

  if (closureCriticalMaterials.propositionId?.status !== "complete" || options.propositionIdStatus === "local_candidate_only_replace_with_real_staging_proposition") {
    checklist.push({
      id: "select_staging_proposition",
      title: "Select a real staging proposition",
      candidates: closureCriticalMaterials.propositionId?.candidates || [],
      details: "Replace the local proof fallback with a real staging proposition id for external proof capture and payout follow-through.",
      tasks: ["N2", "N4", "N8", "N10", "N11"],
    });
  }

  return checklist;
}

function buildExternalClosureInputsManifest(options) {
  const closureSummary = options.closureStatus || readJsonFile(options.closureStatusPath);
  const latestLocalProofPropositionId =
    closureSummary?.discoveredCandidates?.latestLocalProofPropositionId || "";
  const latestLocalProofRecord =
    closureSummary?.discoveredCandidates?.proofRecordDocs?.[0]?.path || null;
  const localPropositionIdCandidates = latestLocalProofPropositionId
    ? [
        {
          proofRecordPath: latestLocalProofRecord,
          propositionId: latestLocalProofPropositionId,
          suitability:
            "local_proof_candidate_only_replace_with_real_staging_proposition",
        },
      ]
    : [];
  const livePropositionCandidates = Array.isArray(
    options.propositionDiscovery?.candidates,
  )
    ? options.propositionDiscovery.candidates
    : [];
  const propositionIdCandidates =
    livePropositionCandidates.length > 0
      ? livePropositionCandidates
      : localPropositionIdCandidates;
  const baseUrlCandidates = Array.isArray(options.publicDiscovery?.baseUrlCandidates)
    ? options.publicDiscovery.baseUrlCandidates
    : [];
  const providedBaseUrlCandidate = buildProvidedBaseUrlCandidate(options.baseUrl);
  const recommendedBaseUrlCandidate =
    chooseRecommendedBaseUrlCandidate(baseUrlCandidates);
  const mergedBaseUrlCandidates =
    recommendedBaseUrlCandidate || providedBaseUrlCandidate
      ? uniqueByOrigin([
          ...(baseUrlCandidates || []),
          ...(recommendedBaseUrlCandidate ? [recommendedBaseUrlCandidate] : []),
          ...(providedBaseUrlCandidate ? [providedBaseUrlCandidate] : []),
        ])
      : baseUrlCandidates;
  const propositionId = propositionIdCandidates[0]?.propositionId || "";
  const propositionIdStatus =
    propositionIdCandidates.length > 0
      ? livePropositionCandidates.length > 0
        ? 'live_candidate_selected'
        : 'local_candidate_only_replace_with_real_staging_proposition'
      : 'required_real_value';
  const discoveryWarnings = uniqueStrings([
    ...(options.publicDiscovery?.warnings || []),
    ...(options.propositionDiscovery?.warnings || []),
  ]);
  const requiredValueSummary = buildRequiredValueSummary({
    baseUrl: options.baseUrl || "",
    previousEnvPath: options.previousEnvPath,
    propositionId,
    stagingEnvPath: options.stagingEnvPath,
  });
  const closureCriticalMaterials = buildClosureCriticalMaterials({
    baseUrl: options.baseUrl || "",
    baseUrlAccess: options.baseUrlAccess || null,
    closureStatus: closureSummary,
    currentEnvMissingKeys: requiredValueSummary.currentEnvMissingKeys,
    networkExecutionReadiness: options.networkExecutionReadiness || null,
    previousEnvMissingKeys: requiredValueSummary.previousEnvMissingKeys,
    previousEnvPath: options.previousEnvPath,
    propositionIdCandidates,
    providedBaseUrlCandidate,
    recommendedBaseUrlCandidate,
    propositionId:
      propositionIdStatus === 'live_candidate_selected' ? propositionId : '',
    stagingEnvPath: options.stagingEnvPath,
    validationNetwork: options.validationNetwork,
    vercelAccessPresent: options.vercelAccessPresent === true,
  });
  const manualActionChecklist = buildManualActionChecklist({
    closureCriticalMaterials,
    propositionIdStatus:
      propositionIdCandidates.length > 0
        ? livePropositionCandidates.length > 0
          ? "live_candidate_selected"
          : "local_candidate_only_replace_with_real_staging_proposition"
        : "required_real_value",
  });

  return {
    generatedAt: (options.now || new Date()).toISOString(),
    releaseEnvFilePath: options.stagingEnvPath,
    previousEnvFilePath: options.previousEnvPath,
    targetNetworkName: options.validationNetwork,
    publicRepository: options.publicDiscovery?.repository || null,
    discoveryWarnings,
    operatorTokenSource: {
      envFilePath: options.stagingEnvPath,
      key: "ARENA_INTERNAL_OPERATOR_BEARER_TOKEN",
      type: "envFile",
    },
    baseUrl: options.baseUrl || "",
    baseUrlStatus: deriveBaseUrlManifestStatus({
      baseUrl: options.baseUrl,
      recommendedBaseUrlOrigin: recommendedBaseUrlCandidate?.origin || "",
    }),
    baseUrlAccess: options.baseUrlAccess || null,
    baseUrlCandidates: mergedBaseUrlCandidates,
    recommendedBaseUrlCandidate: recommendedBaseUrlCandidate || providedBaseUrlCandidate,
    providedBaseUrlCandidate,
    propositionId,
    propositionIdStatus:
      propositionIdCandidates.length > 0
        ? livePropositionCandidates.length > 0
          ? "live_candidate_selected"
          : "local_candidate_only_replace_with_real_staging_proposition"
        : "required_real_value",
    propositionIdCandidates,
    currentEnvMissingKeys: requiredValueSummary.currentEnvMissingKeys,
    previousEnvMissingKeys: requiredValueSummary.previousEnvMissingKeys,
    runtimeInputsMissing: requiredValueSummary.runtimeInputsMissing,
    outstandingRequiredValues: requiredValueSummary.outstandingRequiredValues,
    networkExecutionReadiness: options.networkExecutionReadiness || null,
    manualActionChecklist,
    closureCriticalMaterials,
    commands: {
      validationDeploy: buildCommandParts([
        "pnpm run validation:deploy -- --env-file",
        options.stagingEnvPath,
        "--network",
        options.validationNetwork,
      ]),
      validationPreflight: buildCommandParts([
        "pnpm run validation:preflight -- --env-file",
        options.stagingEnvPath,
        "--deploy-validation --network",
        options.validationNetwork,
      ]),
      externalEvidence: buildCommandParts([
        "pnpm run backend:release:evidence:external -- --env-file",
        options.stagingEnvPath,
        "--previous-env",
        options.previousEnvPath,
        "--base-url <https://host>",
        "--auth-token <operator-token>",
        "--proposition-id <id>",
        "--yes --operator-monitoring-proof",
        "--validation-network",
        options.validationNetwork,
      ]),
    },
  };
}

async function prepareExternalClosureInputs(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const stagingEnvPath =
    options.stagingEnvPath || path.resolve(cwd, "config", "staging.env");
  const previousEnvPath =
    options.previousEnvPath ||
    path.resolve(cwd, "config", "staging.previous.env");
  const outputPath =
    options.outputPath ||
    path.resolve(cwd, "config", "staging.closure-inputs.json");
  const closureStatusPath =
    options.closureStatusPath ||
    path.resolve(cwd, "validation-local", "closure-status.json");
  const validationNetwork =
    String(options.validationNetwork || "validation").trim() || "validation";
  const applyRecommendedBaseUrl = options.applyRecommendedBaseUrl === true;
  const force = options.force === true;
  const probePublicHosts = options.probePublicHosts === true;
  const discoverPublicDeploymentCandidatesImpl =
    options.discoverPublicDeploymentCandidatesImpl || discoverPublicDeploymentCandidates;

  const stagingTemplatePath = path.resolve(cwd, "config", "staging.env.example");
  const previousTemplatePath = path.resolve(
    cwd,
    "config",
    "staging.previous.env.example",
  );

  const createdStagingEnv = copyTemplateIfMissing(
    stagingTemplatePath,
    stagingEnvPath,
    force,
  );
  const createdPreviousEnv = copyTemplateIfMissing(
    previousTemplatePath,
    previousEnvPath,
    force,
  );

  const publicDiscovery = await discoverPublicDeploymentCandidatesImpl({
    cwd,
    execFileSyncImpl: options.execFileSyncImpl,
    fetchImpl: options.fetchImpl,
    probePublicHosts,
  });
  const currentEnvValues = parseEnvFile(stagingEnvPath);
  const previousEnvValues = parseEnvFile(previousEnvPath);
  let hydratedBaseUrl = hasMeaningfulValue(
    currentEnvValues.ARENA_INTERNAL_API_BASE_URL,
  )
    ? currentEnvValues.ARENA_INTERNAL_API_BASE_URL.trim()
    : "";
  let appliedRecommendedBaseUrl = false;
  if (
    applyRecommendedBaseUrl &&
    publicDiscovery?.baseUrlCandidates?.length > 0
  ) {
    const recommendedCandidate = chooseRecommendedBaseUrlCandidate(
      publicDiscovery.baseUrlCandidates,
    );
    if (recommendedCandidate?.origin) {
      appliedRecommendedBaseUrl = updateEnvFileValueIfMissing(
        stagingEnvPath,
        "ARENA_INTERNAL_API_BASE_URL",
        recommendedCandidate.origin,
      );
      hydratedBaseUrl = hasMeaningfulValue(
        parseEnvFile(stagingEnvPath).ARENA_INTERNAL_API_BASE_URL,
      )
        ? parseEnvFile(stagingEnvPath).ARENA_INTERNAL_API_BASE_URL.trim()
        : "";
    }
  }
  const livePropositionDiscovery = await (options.discoverLivePropositionCandidatesImpl || discoverLivePropositionCandidates)({
    authToken:
      currentEnvValues.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN ||
      previousEnvValues.ARENA_INTERNAL_OPERATOR_BEARER_TOKEN ||
      "",
    baseUrl:
      hydratedBaseUrl ||
      currentEnvValues.ARENA_INTERNAL_API_BASE_URL ||
      previousEnvValues.ARENA_INTERNAL_API_BASE_URL ||
      "",
    fetchImpl: options.fetchImpl,
  });
  const networkExecutionReadiness =
    await (options.inspectNetworkExecutionReadinessImpl || inspectNetworkExecutionReadiness)({
      stagingEnvPath,
    });
  const baseUrlAccess = await (options.probeBaseUrlAccessImpl || probeBaseUrlAccess)({
    baseUrl:
      hydratedBaseUrl ||
      currentEnvValues.ARENA_INTERNAL_API_BASE_URL ||
      previousEnvValues.ARENA_INTERNAL_API_BASE_URL ||
      "",
    fetchImpl: options.fetchImpl,
    spawnSyncImpl: options.spawnSyncImpl,
  });
  const vercelAccessPresent =
    hasMeaningfulValue(process.env.VERCEL_PROTECTION_BYPASS_TOKEN) ||
    hasMeaningfulValue(process.env.VERCEL_TRUSTED_OIDC_TOKEN) ||
    hasMeaningfulValue(currentEnvValues.VERCEL_PROTECTION_BYPASS_TOKEN) ||
    hasMeaningfulValue(currentEnvValues.VERCEL_TRUSTED_OIDC_TOKEN) ||
    hasMeaningfulValue(previousEnvValues.VERCEL_PROTECTION_BYPASS_TOKEN) ||
    hasMeaningfulValue(previousEnvValues.VERCEL_TRUSTED_OIDC_TOKEN);
  const manifest = buildExternalClosureInputsManifest({
    baseUrl: hydratedBaseUrl,
    baseUrlAccess,
    closureStatusPath,
    networkExecutionReadiness,
    now: options.now,
    previousEnvPath,
    propositionDiscovery: livePropositionDiscovery,
    publicDiscovery,
    stagingEnvPath,
    validationNetwork,
    vercelAccessPresent,
  });

  ensureParentDirectory(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  logger.info(`Staging env file: ${stagingEnvPath}`);
  logger.info(`Previous env file: ${previousEnvPath}`);
  logger.info(`External closure inputs manifest: ${outputPath}`);
  logger.info(`Validation network: ${validationNetwork}`);
  logger.info(`External evidence command: ${manifest.commands.externalEvidence}`);
  logger.info(
    `Current env missing keys: ${manifest.currentEnvMissingKeys.join(", ") || "none"}`,
  );
  logger.info(
    `Previous env missing keys: ${manifest.previousEnvMissingKeys.join(", ") || "none"}`,
  );
  logger.info(
    `Runtime inputs missing: ${manifest.runtimeInputsMissing.join(", ") || "none"}`,
  );
  logger.info(
    `Immediate external blockers: ${[
      manifest.closureCriticalMaterials.operatorToken.status === "missing"
        ? "operator_token"
        : null,
      manifest.closureCriticalMaterials.rpcUrl.status === "missing" ? "rpc_url" : null,
      manifest.closureCriticalMaterials.propositionId.status !== "complete"
        ? "proposition_id"
        : null,
      manifest.closureCriticalMaterials.cleanHostIdentityGate.status,
    ]
      .filter(Boolean)
      .join(", ")}`,
  );
  logger.info(`Discovered external base-url candidates: ${manifest.baseUrlCandidates.length}`);
  if (appliedRecommendedBaseUrl) {
    logger.info(
      `Applied recommended ARENA_INTERNAL_API_BASE_URL candidate to ${stagingEnvPath}: ${hydratedBaseUrl}`,
    );
  }

  if (createdStagingEnv) {
    logger.info(`Created ${stagingEnvPath} from ${stagingTemplatePath}`);
  }
  if (createdPreviousEnv) {
    logger.info(`Created ${previousEnvPath} from ${previousTemplatePath}`);
  }
  for (const warning of manifest.discoveryWarnings) {
    logger.info(`Discovery warning: ${warning}`);
  }
  for (const warning of livePropositionDiscovery.warnings || []) {
    logger.info(`Proposition discovery warning: ${warning}`);
  }

  logger.pass("External closure input materials are prepared.");
  return 0;
}

async function main() {
  const exitCode = await prepareExternalClosureInputs(parseArgs(process.argv.slice(2)));
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildExternalClosureInputsManifest,
  buildManualActionChecklist,
  discoverLivePropositionCandidates,
  inspectNetworkExecutionReadiness,
  discoverPublicDeploymentCandidates,
  parseArgs,
  parseGitHubRepositoryFromOrigin,
  prepareExternalClosureInputs,
  probeBaseUrlAccess,
};





