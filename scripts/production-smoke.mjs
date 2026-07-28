import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

export class SmokeClient {
  constructor(baseUrl, host) {
    this.baseUrl = new URL(baseUrl);
    this.host = host;
    this.cookies = new Map();
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
  const apiBaseUrl = required(env, "API_BASE_URL");
  const frontendBaseUrl = required(env, "BASE_URL");
  const apiHost = required(env, "API_HOST");
  const frontendHost = required(env, "FRONTEND_HOST");
  const primaryId = credentials.organizations.primary_id;
  const secondaryId = credentials.organizations.secondary_id;
  const checks = [];

  const check = async (name, operation) => {
    const started = Date.now();
    try {
      await operation();
      checks.push({ name, succeeded: true, elapsed_ms: Date.now() - started });
    } catch (error) {
      checks.push({
        name,
        succeeded: false,
        elapsed_ms: Date.now() - started,
        error: error.message,
      });
      throw error;
    }
  };

  try {
    const sessions = {};
    for (const role of ["member", "organization_admin", "system_admin"]) {
      const client = new SmokeClient(apiBaseUrl, apiHost);
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
      assertStatus(
        await sessions.member.request(
          `/api/v1/organizations/${primaryId}/admin/dashboard`,
        ),
        404,
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
    await check("new API: readiness", async () => {
      const response = await sessions.system_admin.request("/api/health/ready");
      assertStatus(response, 200, "readiness");
      if (parseJson(response, "readiness").status !== "ready")
        throw new Error("readiness body is not ready");
    });

    const frontend = new SmokeClient(frontendBaseUrl, frontendHost);
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
  if (response.status !== expected)
    throw new Error(`${label}: expected HTTP ${expected}, got ${response.status}`);
}

function parseJson(response, label) {
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`${label}: response is not JSON`);
  }
}

function rawRequest(url, { method, headers, body }) {
  const transport = url.protocol === "https:" ? https : http;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload) headers["Content-Length"] = Buffer.byteLength(payload);
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      { method, headers, timeout: 15_000 },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("timeout", () => request.destroy(new Error(`timeout: ${url}`)));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke().catch((error) => {
    process.stderr.write(`production smoke test failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
