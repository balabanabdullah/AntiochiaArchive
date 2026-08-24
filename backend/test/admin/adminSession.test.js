import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession, hasValidSession, destroySession, verifyAdminToken, loginRateLimit, _resetForTests,
} from "../../admin/adminSession.js";

const ORIGINAL_ADMIN_TOKEN = process.env.ADMIN_TOKEN;

test.beforeEach(() => {
  _resetForTests();
  process.env.ADMIN_TOKEN = "test-secret-token-value";
});

test.after(() => {
  if (ORIGINAL_ADMIN_TOKEN === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = ORIGINAL_ADMIN_TOKEN;
});

/** Minimal mock Express req/res good enough for adminSession's cookie-based API. */
function mockReq({ cookie = "", secure = false, header = {}, ip = "127.0.0.1", method = "GET" } = {}) {
  return {
    headers: { cookie, ...header },
    secure,
    ip,
    method,
    get(name) {
      const key = name.toLowerCase();
      if (key === "x-csrf-token") return header["x-csrf-token"];
      if (key === "x-forwarded-proto") return header["x-forwarded-proto"];
      if (key === "cookie") return cookie;
      return undefined;
    },
  };
}

function mockRes() {
  const headers = {};
  return {
    headers,
    getHeader(name) { return headers[name]; },
    setHeader(name, value) { headers[name] = value; },
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function cookieHeaderFrom(res) {
  const setCookies = res.getHeader("Set-Cookie") || [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

test("verifyAdminToken: timing-safe match against ADMIN_TOKEN, rejects wrong/empty/missing-config", () => {
  assert.equal(verifyAdminToken("test-secret-token-value"), true);
  assert.equal(verifyAdminToken("wrong-token"), false);
  assert.equal(verifyAdminToken(""), false);
  delete process.env.ADMIN_TOKEN;
  assert.equal(verifyAdminToken("test-secret-token-value"), false, "no configured secret must never validate anything");
});

test("createSession + hasValidSession: a freshly created session is valid, and its cookies round-trip", () => {
  const req = mockReq();
  const res = mockRes();
  const { expiresAt } = createSession(req, res);
  assert.ok(expiresAt > Date.now());

  const cookieHeader = cookieHeaderFrom(res);
  assert.match(cookieHeader, /aa_admin_session=/);
  assert.match(cookieHeader, /aa_admin_csrf=/);

  const req2 = mockReq({ cookie: cookieHeader });
  assert.equal(hasValidSession(req2), true);
});

test("hasValidSession: no cookie, malformed cookie, or unsigned/tampered cookie -> false, never throws", () => {
  assert.equal(hasValidSession(mockReq()), false);
  assert.equal(hasValidSession(mockReq({ cookie: "aa_admin_session=not-a-real-value" })), false);
  assert.equal(hasValidSession(mockReq({ cookie: "aa_admin_session=abc.wrongsignature" })), false);
});

test("a session cookie from ONE createSession call is never valid after destroySession", () => {
  const req = mockReq();
  const res = mockRes();
  createSession(req, res);
  const cookieHeader = cookieHeaderFrom(res);

  const authedReq = mockReq({ cookie: cookieHeader });
  assert.equal(hasValidSession(authedReq), true);

  destroySession(authedReq, mockRes());
  assert.equal(hasValidSession(mockReq({ cookie: cookieHeader })), false, "session must be invalidated after logout");
});

test("CSRF: the session cookie alone is not enough to satisfy a write requiring X-CSRF-Token — see requireAdminSession behavior via adminRoutes tests for the full 403 path", () => {
  // adminSession exposes CSRF checking only via requireAdminSession (route
  // middleware); this test just confirms two DIFFERENT sessions never share
  // a CSRF token, which is the property that makes double-submit safe.
  const req1 = mockReq(); const res1 = mockRes();
  createSession(req1, res1);
  const req2 = mockReq(); const res2 = mockRes();
  createSession(req2, res2);
  const csrf1 = cookieHeaderFrom(res1).match(/aa_admin_csrf=([^;]+)/)[1];
  const csrf2 = cookieHeaderFrom(res2).match(/aa_admin_csrf=([^;]+)/)[1];
  assert.notEqual(csrf1, csrf2);
});

test("loginRateLimit: allows up to the limit, then blocks with 429, scoped per IP", () => {
  for (let i = 0; i < 8; i++) {
    const r = mockRes();
    loginRateLimit(mockReq({ ip: "1.1.1.1" }), r, () => { r.calledNext = true; });
    assert.equal(r.calledNext, true, `attempt ${i + 1} should pass`);
  }
  // The 9th call should be rejected (429) rather than calling next().
  const res9 = mockRes();
  let nextCalled = false;
  loginRateLimit(mockReq({ ip: "1.1.1.1" }), res9, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res9.statusCode, 429);

  // A different IP is unaffected.
  const resOther = mockRes();
  let otherNextCalled = false;
  loginRateLimit(mockReq({ ip: "2.2.2.2" }), resOther, () => { otherNextCalled = true; });
  assert.equal(otherNextCalled, true);
});

test("Secure cookie attribute is only set for an HTTPS-perceived request (req.secure or X-Forwarded-Proto: https) — never for plain local-dev HTTP", () => {
  const httpRes = mockRes();
  createSession(mockReq({ secure: false }), httpRes);
  assert.doesNotMatch(cookieHeaderFromRaw(httpRes), /Secure/);

  const httpsRes = mockRes();
  createSession(mockReq({ secure: true }), httpsRes);
  assert.match(cookieHeaderFromRaw(httpsRes), /Secure/);

  const proxiedRes = mockRes();
  createSession(mockReq({ header: { "x-forwarded-proto": "https" } }), proxiedRes);
  assert.match(cookieHeaderFromRaw(proxiedRes), /Secure/);
});

function cookieHeaderFromRaw(res) {
  return (res.getHeader("Set-Cookie") || []).join(" | ");
}

test("Session cookie is always HttpOnly; CSRF cookie is never HttpOnly (must be JS-readable to echo back)", () => {
  const res = mockRes();
  createSession(mockReq(), res);
  const raw = res.getHeader("Set-Cookie");
  const sessionCookie = raw.find((c) => c.startsWith("aa_admin_session="));
  const csrfCookie = raw.find((c) => c.startsWith("aa_admin_csrf="));
  assert.match(sessionCookie, /HttpOnly/);
  assert.doesNotMatch(csrfCookie, /HttpOnly/);
});
