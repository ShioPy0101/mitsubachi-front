import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertReadyStatus,
  assertStatusIn,
  connectionOptions,
  createLoopbackLookup,
  parseCredentials,
  rawRequest,
  SmokeClient,
  smokeTargets,
} from "./production-smoke.mjs";

test("新releaseのreadinessはreadyだけを許容する", () => {
  assert.doesNotThrow(() => assertReadyStatus({ status: "ready" }));
  assert.throws(() => assertReadyStatus({ status: "ok" }), /unexpected status: ok/);
  assert.throws(
    () => assertReadyStatus({ status: "unavailable" }),
    /unexpected status: unavailable/,
  );
});

test("権限外APIは403または404を拒否結果として扱う", () => {
  assert.doesNotThrow(() =>
    assertStatusIn({ status: 403 }, [403, 404], "member admin"),
  );
  assert.doesNotThrow(() =>
    assertStatusIn({ status: 404 }, [403, 404], "member admin"),
  );
  assert.throws(
    () => assertStatusIn({ status: 401 }, [403, 404], "member admin"),
    /expected HTTP 403 or 404, got 401/,
  );
});

test("単独実行用のKEY=value認証情報も読み取る", () => {
  const credentials = parseCredentials(`
MEMBER_TOKEN=member-token
ORGANIZATION_ADMIN_TOKEN=organization-admin-token
SYSTEM_ADMIN_TOKEN=system-admin-token
PRIMARY_ORGANIZATION_ID=10
SECONDARY_ORGANIZATION_ID=20
`);

  assert.equal(credentials.users.member.token, "member-token");
  assert.equal(credentials.organizations.secondary_id, "20");
});

test("CSRF cookieとHostを保持してログイン検証を送信する", async (context) => {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/api/v1/csrf_token") {
        response.setHeader("Set-Cookie", "session=test-session; Path=/; HttpOnly");
        response.end(JSON.stringify({ csrf_token: "test-csrf" }));
      } else {
        response.end(JSON.stringify({ message: "ok" }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const address = server.address();
  const client = new SmokeClient(
    `http://api.example.test:${address.port}`,
    "api.example.test",
    { resolvedAddress: "127.0.0.1" },
  );
  const response = await client.request("/api/v1/auth/login/verify", {
    method: "POST",
    csrf: true,
    body: { token: "one-time-token" },
  });

  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].headers.host, "api.example.test");
  assert.equal(requests[1].headers.cookie, "session=test-session");
  assert.equal(requests[1].headers["x-csrf-token"], "test-csrf");
  assert.deepEqual(JSON.parse(requests[1].body), { token: "one-time-token" });
});

test("公開経路はfrontendとAPIのHTTPSホストを使いRails readinessだけをPumaへ直結する", () => {
  const targets = smokeTargets({
    BASE_URL: "https://mitsubachi.shiosalt.com/",
    API_BASE_URL: "https://mitsubachi-api.shiosalt.com/",
    FRONTEND_HOST: "mitsubachi.shiosalt.com",
    API_HOST: "mitsubachi-api.shiosalt.com",
    RAILS_READINESS_URL: "http://127.0.0.1:3000/api/health/ready",
  });

  assert.equal(targets.frontendBaseUrl.hostname, "mitsubachi.shiosalt.com");
  assert.equal(targets.apiBaseUrl.hostname, "mitsubachi-api.shiosalt.com");
  assert.equal(targets.resolvedAddress, "127.0.0.1");
  assert.equal(
    targets.railsReadinessUrl.toString(),
    "http://127.0.0.1:3000/api/health/ready",
  );
  assert.throws(
    () =>
      smokeTargets({
        BASE_URL: "http://127.0.0.1/",
        API_BASE_URL: "https://mitsubachi-api.shiosalt.com/",
        FRONTEND_HOST: "mitsubachi.shiosalt.com",
        API_HOST: "mitsubachi-api.shiosalt.com",
        RAILS_READINESS_URL: "http://127.0.0.1:3000/api/health/ready",
      }),
    /BASE_URL must be https/,
  );
});

test("loopback lookupは外部DNSを使わずTLS検証を有効にする", async () => {
  const lookup = createLoopbackLookup("127.0.0.1");
  const resolved = await new Promise((resolve, reject) => {
    lookup(
      "外部DNSへ問い合わせない.example",
      { all: false },
      (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      },
    );
  });
  const options = connectionOptions(new URL("https://frontend.example.test/"), {
    resolvedAddress: "127.0.0.1",
    lookup,
  });

  assert.deepEqual(resolved, { address: "127.0.0.1", family: 4 });
  assert.equal(options.servername, "frontend.example.test");
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.lookup, lookup);
});

test("ローカルHTTPSでもURLとHostとSNIを本番名に保ち接続先だけをloopbackにする", async (context) => {
  const tls = createTestCertificate(context, "frontend.example.test");
  const observed = {};
  const server = https.createServer(tls, (request, response) => {
    observed.host = request.headers.host;
    response.end('<div id="root"></div>');
  });
  server.on("secureConnection", (socket) => {
    observed.servername = socket.servername;
    observed.remoteAddress = socket.localAddress;
  });
  await listen(server);
  context.after(() => server.close());

  const client = new SmokeClient(
    `https://frontend.example.test:${server.address().port}/`,
    "frontend.example.test",
    { resolvedAddress: "127.0.0.1", ca: tls.ca },
  );
  const response = await client.request("/organizations/7/drive");

  assert.equal(response.status, 200);
  assert.equal(observed.host, "frontend.example.test");
  assert.equal(observed.servername, "frontend.example.test");
  assert.equal(observed.remoteAddress, "127.0.0.1");
  assert.equal(
    response.diagnostic.requested_url,
    `https://frontend.example.test:${server.address().port}/organizations/7/drive`,
  );
  assert.equal(response.diagnostic.resolved_address, "127.0.0.1");
});

test("HTTP異常statusは原因判断用情報を保持しsecretを出さない", async (context) => {
  const tls = createTestCertificate(context, "frontend.example.test");
  const server = https.createServer(tls, (request, response) => {
    const status = Number(request.url.slice(1));
    response.writeHead(status, {
      "X-Test-Status": String(status),
      "Set-Cookie": "session=secret-session",
    });
    response.end(JSON.stringify({ status, token: "secret-token" }));
  });
  await listen(server);
  context.after(() => server.close());

  for (const status of [418, 404, 500]) {
    const response = await rawRequest(
      new URL(`https://frontend.example.test:${server.address().port}/${status}`),
      {
        method: "GET",
        headers: { Host: "frontend.example.test" },
        resolvedAddress: "127.0.0.1",
        ca: tls.ca,
      },
    );
    let error;
    try {
      assertStatusIn(response, [200], `frontend ${status}`);
      assert.fail("異常statusが成功として扱われた");
    } catch (caught) {
      error = caught;
    }

    assert.equal(error.diagnostic.http_status, status);
    assert.equal(error.diagnostic.http_host, "frontend.example.test");
    assert.equal(error.diagnostic.tls_servername, "frontend.example.test");
    assert.equal(error.diagnostic.response_headers["set-cookie"], "<redacted>");
    assert.match(error.diagnostic.response_body_preview, /<redacted>/);
    assert.doesNotMatch(
      JSON.stringify(error.diagnostic),
      /secret-token|secret-session/,
    );
  }
});

test("TLS検証失敗と接続拒否にも接続診断を付ける", async (context) => {
  const tls = createTestCertificate(context, "frontend.example.test");
  const server = https.createServer(tls, (_request, response) => response.end("ok"));
  await listen(server);
  const port = server.address().port;

  await assert.rejects(
    rawRequest(new URL(`https://frontend.example.test:${port}/`), {
      method: "GET",
      headers: { Host: "frontend.example.test" },
      resolvedAddress: "127.0.0.1",
    }),
    (error) => error.diagnostic?.resolved_address === "127.0.0.1",
  );
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(
    rawRequest(new URL(`https://frontend.example.test:${port}/`), {
      method: "GET",
      headers: { Host: "frontend.example.test" },
      resolvedAddress: "127.0.0.1",
      ca: tls.ca,
    }),
    (error) =>
      error.diagnostic?.http_status === null &&
      error.diagnostic?.tls_servername === "frontend.example.test",
  );
});

function createTestCertificate(context, hostname) {
  const directory = mkdtempSync(join(tmpdir(), "mitsubachi-smoke-tls-"));
  const keyPath = join(directory, "key.pem");
  const certificatePath = join(directory, "certificate.pem");
  const result = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
      "-days",
      "1",
      "-subj",
      `/CN=${hostname}`,
      "-addext",
      `subjectAltName=DNS:${hostname}`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const cert = readFileSync(certificatePath);
  return { key: readFileSync(keyPath), cert, ca: cert };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}
