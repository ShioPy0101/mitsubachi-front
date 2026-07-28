import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  assertReadyStatus,
  assertStatusIn,
  parseCredentials,
  SmokeClient,
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
    `http://127.0.0.1:${address.port}`,
    "api.example.test",
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
