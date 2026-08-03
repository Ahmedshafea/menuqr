import "server-only";

const blockedHosts = new Set(["localhost", "menuqr-eg.vercel.app", "menuqr-egy.vercel.app"]);

export function normalizeCustomDomain(input: string) {
  const raw = input.trim().toLowerCase().replace(/\.$/, "");
  if (!raw || raw.includes("/") || raw.includes(":")) throw new Error("INVALID_DOMAIN");
  let hostname: string;
  try {
    hostname = new URL(`https://${raw}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    throw new Error("INVALID_DOMAIN");
  }
  if (
    hostname !== raw ||
    hostname.length > 253 ||
    !hostname.includes(".") ||
    blockedHosts.has(hostname) ||
    hostname.endsWith(".vercel.app") ||
    hostname.split(".").some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
  ) throw new Error("INVALID_DOMAIN");
  return hostname;
}

type VercelDomainResult = {
  name?: string;
  verified?: boolean;
  verification?: Array<{ type?: string; domain?: string; value?: string; reason?: string }>;
  error?: { code?: string; message?: string };
};

function vercelConfiguration() {
  const token = process.env.MENUQR_VERCEL_ACCESS_TOKEN?.trim();
  const project = process.env.MENUQR_VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.MENUQR_VERCEL_TEAM_ID?.trim();
  if (!token || !project) return null;
  const team = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  return { token, project, team };
}

async function vercelRequest(path: string, init: RequestInit) {
  const config = vercelConfiguration();
  if (!config) throw new Error("VERCEL_DOMAIN_API_NOT_CONFIGURED");
  const response = await fetch(`https://api.vercel.com${path}${config.team}`, {
    ...init,
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({})) as VercelDomainResult;
  if (!response.ok && body.error?.code !== "not_modified")
    throw new Error(body.error?.code || "VERCEL_DOMAIN_API_FAILED");
  return body;
}

export async function addProjectDomain(domain: string) {
  const config = vercelConfiguration();
  if (!config) throw new Error("VERCEL_DOMAIN_API_NOT_CONFIGURED");
  const result = await vercelRequest(`/v10/projects/${encodeURIComponent(config.project)}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  if (result.error?.code === "not_modified")
    return vercelRequest(`/v9/projects/${encodeURIComponent(config.project)}/domains/${encodeURIComponent(domain)}`, { method: "GET" });
  return result;
}

export async function verifyProjectDomain(domain: string) {
  const config = vercelConfiguration();
  if (!config) throw new Error("VERCEL_DOMAIN_API_NOT_CONFIGURED");
  return vercelRequest(`/v9/projects/${encodeURIComponent(config.project)}/domains/${encodeURIComponent(domain)}/verify`, { method: "POST" });
}

export async function removeProjectDomain(domain: string) {
  const config = vercelConfiguration();
  if (!config) throw new Error("VERCEL_DOMAIN_API_NOT_CONFIGURED");
  return vercelRequest(`/v9/projects/${encodeURIComponent(config.project)}/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
}

export function publicVerification(value: VercelDomainResult) {
  return value.verification?.map((item) => ({
    type: item.type || "TXT",
    domain: item.domain || "",
    value: item.value || "",
    reason: item.reason || "",
  })) ?? [];
}

export function isVercelDomainApiConfigured() {
  return Boolean(vercelConfiguration());
}
