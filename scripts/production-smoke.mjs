import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

export class SmokeClient {
  constructor(baseUrl, host, options = {}) {
    this.baseUrl = new URL(baseUrl);
    this.host = host;
    this.resolvedAddress = options.resolvedAddress;
    this.ca = options.ca;
    this.cookies = new Map();

    if (this.baseUrl.hostname !== this.host) {
      throw new Error(
        `smoke URL host ${this.baseUrl.hostname} does not match configured host ${this.host}`,
      );
    }
  }

  async request(path, { method = "GET", body, csrf = false } = {}) {
    const headers = { Accept: "application/json", Host: this.host };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (csrf) headers["X-CSRF-Token"] = await this.csrfToken();
    if (this.cookies.size)
      headers.Cookie = [...this.cookies]
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");

    const response = await rawRequest(new URL(path, this.baseUrl), {
      method,
      headers,
      body,
      resolvedAddress: this.resolvedAddress,
      ca: this.ca,
    });
    this.storeCookies(response.headers["set-cookie"]);
    return response;
  }

  async csrfToken() {
    const response = await this.request("/api/v1/csrf_token");
    assertStatus(response, 200, "CSRF token");
    const token = parseJson(response, "CSRF token").csrf_token;
    if (typeof token !== "string" || !token)
      throw new Error("CSRF token response has no csrf_token");
    return token;
  }

  storeCookies(values = []) {
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0)
        this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
}

export async function runSmoke(env = process.env) {
  const credentials = parseCredentials(
    await readFile(required(env, "CREDENTIALS_FILE"), "utf8"),
  );
  const targets = smokeTargets(env);
  const {
    apiBaseUrl,
    frontendBaseUrl,
    apiHost,
    frontendHost,
    resolvedAddress,
    railsReadinessUrl,
  } = targets;
  const primaryId = credentials.organizations.primary_id;
  const secondaryId = credentials.organizations.secondary_id;
  const checks = [];

  const check = async (name, operation) => {
    const started = Date.now();
    try {
      await operation();
      checks.push({ name, succeeded: true, elapsed_ms: Date.now() - started });
    } catch (error) {
      const result = {
        name,
        succeeded: false,
        elapsed_ms: Date.now() - started,
        error: error.message,
      };
      if (error.diagnostic) result.diagnostic = error.diagnostic;
      checks.push(result);
      throw error;
    }
  };

  try {
    const sessions = {};
    for (const role of ["member", "organization_admin", "system_admin"]) {
      const client = new SmokeClient(apiBaseUrl, apiHost, { resolvedAddress });
      await check(`${role}: login`, async () => {
        const response = await client.request("/api/v1/auth/login/verify", {
          method: "POST",
          csrf: true,
          body: { token: credentials.users[role].token },
        });
        assertStatus(response, 200, `${role} login`);
      });
      await check(`${role}: current user`, async () =>
        assertStatus(await client.request("/api/v1/me"), 200, `${role} me`),
      );
      sessions[role] = client;
    }

    await check("member: Drive", async () =>
      assertStatus(
        await sessions.member.request(`/api/v1/organizations/${primaryId}/drive_items`),
        200,
        "member Drive",
      ),
    );
    await check("member: Trash", async () =>
      assertStatus(
        await sessions.member.request(
          `/api/v1/organizations/${primaryId}/drive_items/trash`,
        ),
        200,
        "member Trash",
      ),
    );
    await check("member: organization switch", async () =>
      assertStatus(
        await sessions.member.request(
          `/api/v1/organizations/${secondaryId}/drive_items`,
        ),
        200,
        "member secondary organization",
      ),
    );
    await check("member: admin denied", async () =>
      assertStatusIn(
        await sessions.member.request(
          `/api/v1/organizations/${primaryId}/admin/dashboard`,
        ),
        [403, 404],
        "member admin",
      ),
    );
    await check("organization_admin: organization admin", async () =>
      assertStatus(
        await sessions.organization_admin.request(
          `/api/v1/organizations/${primaryId}/admin/dashboard`,
        ),
        200,
        "organization admin dashboard",
      ),
    );
    await check("system_admin: system admin", async () =>
      assertStatus(
        await sessions.system_admin.request("/api/v1/admin/dashboard"),
        200,
        "system admin dashboard",
      ),
    );
    await check("Rails process: readiness", async () => {
      const response = await rawRequest(new URL(railsReadinessUrl), {
        method: "GET",
        headers: { Accept: "application/json", Host: apiHost },
      });
      assertStatus(response, 200, "readiness");
      assertReadyStatus(parseJson(response, "readiness"));
    });

    const frontend = new SmokeClient(frontendBaseUrl, frontendHost, {
      resolvedAddress,
    });
    for (const path of [
      `/organizations/${primaryId}/drive`,
      `/organizations/${primaryId}/trash`,
      `/system-admin/dashboard`,
    ]) {
      await check(`frontend: ${path}`, async () => {
        const response = await frontend.request(path);
        assertStatus(response, 200, path);
        if (
          !response.body.includes('<div id="root"') &&
          !response.body.includes("<div id='root'")
        ) {
          throw new Error(`${path} did not return the frontend application`);
        }
      });
    }
  } catch (error) {
    await saveReport(env, checks, false, error.message);
    throw error;
  }

  return saveReport(env, checks, true, null);
}

export function smokeTargets(env) {
  const apiHost = required(env, "API_HOST");
  const frontendHost = required(env, "FRONTEND_HOST");
  const apiBaseUrl = new URL(required(env, "API_BASE_URL"));
  const frontendBaseUrl = new URL(required(env, "BASE_URL"));
  const railsReadinessUrl = new URL(required(env, "RAILS_READINESS_URL"));
  const resolvedAddress = env.SMOKE_RESOLVED_ADDRESS ?? "127.0.0.1";

  for (const [label, url, host] of [
    ["BASE_URL", frontendBaseUrl, frontendHost],
    ["API_BASE_URL", apiBaseUrl, apiHost],
  ]) {
    if (url.protocol !== "https:" || url.hostname !== host) {
      throw new Error(`${label} must be https://${host}/`);
    }
  }
  if (
    railsReadinessUrl.protocol !== "http:" ||
    railsReadinessUrl.hostname !== "127.0.0.1"
  ) {
    throw new Error("RAILS_READINESS_URL must use direct HTTP to 127.0.0.1");
  }

  return {
    apiBaseUrl,
    frontendBaseUrl,
    apiHost,
    frontendHost,
    resolvedAddress,
    railsReadinessUrl,
  };
}

export function parseCredentials(source) {
  try {
    return JSON.parse(source);
  } catch {
    const values = Object.fromEntries(
      source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    return {
      users: {
        member: { token: required(values, "MEMBER_TOKEN") },
        organization_admin: {
          token: required(values, "ORGANIZATION_ADMIN_TOKEN"),
        },
        system_admin: { token: required(values, "SYSTEM_ADMIN_TOKEN") },
      },
      organizations: {
        primary_id: required(values, "PRIMARY_ORGANIZATION_ID"),
        secondary_id: required(values, "SECONDARY_ORGANIZATION_ID"),
      },
    };
  }
}

async function saveReport(env, checks, succeeded, error) {
  const report = { release_id: env.RELEASE_ID ?? null, succeeded, checks, error };
  await writeFile(required(env, "OUTPUT"), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o640,
  });
  return report;
}

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    const error = new Error(
      `${label}: expected HTTP ${expected}, got ${response.status}`,
    );
    error.diagnostic = response.diagnostic;
    throw error;
  }
}

export function assertStatusIn(response, expected, label) {
  if (!expected.includes(response.status)) {
    const error = new Error(
      `${label}: expected HTTP ${expected.join(" or ")}, got ${response.status}`,
    );
    error.diagnostic = response.diagnostic;
    throw error;
  }
}

export function assertReadyStatus(body) {
  if (body.status !== "ready") {
    throw new Error(`readiness body has unexpected status: ${body.status}`);
  }
}

function parseJson(response, label) {
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`${label}: response is not JSON`);
  }
}

export function createLoopbackLookup(resolvedAddress = "127.0.0.1") {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, [{ address: resolvedAddress, family: 4 }]);
    } else {
      callback(null, resolvedAddress, 4);
    }
  };
}

export function connectionOptions(
  url,
  { resolvedAddress, ca, lookup = createLoopbackLookup(resolvedAddress) } = {},
) {
  if (!resolvedAddress) return {};

  const options = { lookup };
  if (url.protocol === "https:") {
    options.servername = url.hostname;
    options.rejectUnauthorized = true;
    options.ca = ca;
  }
  return options;
}

export function rawRequest(
  url,
  { method, headers, body, resolvedAddress, ca, lookup } = {},
) {
  const transport = url.protocol === "https:" ? https : http;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload) headers["Content-Length"] = Buffer.byteLength(payload);
  const connection = connectionOptions(url, { resolvedAddress, ca, lookup });
  const diagnostic = requestDiagnostic(url, headers, resolvedAddress);
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      { method, headers, timeout: 15_000, ...connection },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          const responseDiagnostic = {
            ...diagnostic,
            http_status: response.statusCode,
            response_headers: sanitizeHeaders(response.headers),
            response_body_preview: sanitizeBody(responseBody.slice(0, 512)),
          };
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: responseBody,
            diagnostic: responseDiagnostic,
          });
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error(`timeout: ${url}`)));
    request.on("error", (error) => {
      error.diagnostic = {
        ...diagnostic,
        http_status: null,
        response_headers: {},
        response_body_preview: null,
        transport_error: error.message,
      };
      reject(error);
    });
    if (payload) request.write(payload);
    request.end();
  });
}

function requestDiagnostic(url, headers, resolvedAddress) {
  return {
    requested_url: url.toString(),
    resolved_address: resolvedAddress ?? url.hostname,
    http_host: headers.Host ?? url.host,
    tls_servername: url.protocol === "https:" ? url.hostname : null,
  };
}

function sanitizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      name.toLowerCase() === "set-cookie" ? "<redacted>" : value,
    ]),
  );
}

function sanitizeBody(body) {
  return body
    .replace(/("(?:token|password|secret|cookie)"\s*:\s*")[^"]*/gi, "$1<redacted>")
    .replace(/((?:token|password|secret|cookie)=)[^&\s]*/gi, "$1<redacted>");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke().catch((error) => {
    process.stderr.write(`production smoke test failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
