import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDataStoreName } from "../dataStore.js";
import { initializeFirestore } from "../firestore.js";
import { requireAdmin } from "../auth.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("data store selection defaults to file and accepts firestore", () => {
  assert.equal(normalizeDataStoreName(undefined), "file");
  assert.equal(normalizeDataStoreName(" FIRESTORE "), "firestore");
  assert.throws(() => normalizeDataStoreName("automatic"), /file.*firestore/);
});

test("protected middleware rejects a missing administrator token", () => {
  const original = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  const response = responseRecorder();
  requireAdmin({ get: () => "" }, response, () => assert.fail("next must not run"));
  assert.equal(response.statusCode, 503);
  restoreEnvironment("ADMIN_TOKEN", original);
});

test("protected middleware accepts the configured bearer token", () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "test-only-token";
  const response = responseRecorder();
  let nextCalled = false;
  requireAdmin(
    { get: () => "Bearer test-only-token" },
    response,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
  restoreEnvironment("ADMIN_TOKEN", original);
});

test("protected middleware rejects a request without the configured bearer token", () => {
  const original = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "test-only-token";
  const response = responseRecorder();
  requireAdmin({ get: () => "" }, response, () => assert.fail("next must not run"));
  assert.equal(response.statusCode, 401);
  restoreEnvironment("ADMIN_TOKEN", original);
});

test("Firestore initialization fails closed without a project", () => {
  const original = process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  assert.throws(() => initializeFirestore(), /GOOGLE_CLOUD_PROJECT/);
  restoreEnvironment("GOOGLE_CLOUD_PROJECT", original);
});
