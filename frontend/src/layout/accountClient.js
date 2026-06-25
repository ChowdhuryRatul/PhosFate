const DEFAULT_ACCOUNT_API_BASE_URL = "https://account.structf.studio";

function cleanBaseUrl(value) {
  const trimmed = value?.trim();
  return (trimmed || DEFAULT_ACCOUNT_API_BASE_URL).replace(/\/+$/, "");
}

export const accountApiBaseUrl = cleanBaseUrl(
  import.meta.env.VITE_ACCOUNT_API_BASE_URL,
);

const accountLoginBaseUrl =
  import.meta.env.VITE_ACCOUNT_LOGIN_URL?.trim() ||
  accountApiBaseUrl + "/login";

export function accountLoginUrl(returnTo) {
  const url = new URL(accountLoginBaseUrl);
  const destination =
    returnTo || (typeof window !== "undefined" ? window.location.href : "");
  if (destination) {
    url.searchParams.set("return_to", destination);
  }
  return url.toString();
}

export function supportsSharedAccountCookies() {
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "account.structf.studio" ||
    hostname.endsWith(".structf.studio")
  );
}

async function readJson(response) {
  return response.json().catch(() => null);
}

function accountError(status, body) {
  const error = new Error(
    body?.error?.message || "Account request failed (" + status + ")",
  );
  error.status = status;
  error.code = body?.error?.code || "account_request_failed";
  return error;
}

async function accountRequest(path, options = {}) {
  const response = await fetch(accountApiBaseUrl + path, {
    credentials: "include",
    ...options,
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw accountError(response.status, body);
  }

  return body;
}

export async function fetchAccountSession(signal) {
  const body = await accountRequest("/api/session", {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!body?.ok) {
    throw new Error("Unable to load account session.");
  }

  return body;
}

export async function getCsrfToken() {
  const body = await accountRequest("/api/csrf");
  return body.csrfToken;
}

export async function listJobs({ limit = 20, appSlug } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (appSlug) {
    params.set("app", appSlug);
  }
  return accountRequest("/api/jobs?" + params.toString());
}

export async function createJob(input) {
  const csrfToken = await getCsrfToken();
  return accountRequest("/api/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({
      appSlug: input.appSlug,
      jobType: input.jobType,
      inputSummary: input.inputSummary,
      publicLabel: input.publicLabel,
      idempotencyKey: input.idempotencyKey,
    }),
  });
}

export async function getJob(jobId) {
  return accountRequest("/api/jobs/" + encodeURIComponent(jobId));
}

export async function downloadJobArtifact(jobId, artifactName) {
  return accountRequest(
    "/api/jobs/" +
      encodeURIComponent(jobId) +
      "/download/" +
      encodeURIComponent(artifactName),
  );
}

export function jobArtifactDownloadUrl(jobId, artifactName) {
  return (
    accountApiBaseUrl +
    "/api/jobs/" +
    encodeURIComponent(jobId) +
    "/download/" +
    encodeURIComponent(artifactName)
  );
}
