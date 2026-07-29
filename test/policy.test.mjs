import assert from "node:assert/strict";
import { test } from "node:test";
import { assertSafeHost, inspectRequest, isPrivateAddress } from "../src/policy.mjs";

test("classifies private and public addresses", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.0.0.4"), true);
  assert.equal(isPrivateAddress("172.20.1.1"), true);
  assert.equal(isPrivateAddress("192.168.1.1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("::1"), true);
});

test("enforces exact hosts, HTTPS, and read-only methods", () => {
  const options = { allowedHosts: new Set(["codelit.io"]), allowHttp: false };
  assert.equal(inspectRequest("https://codelit.io/agents", "GET", options).ok, true);
  assert.match(inspectRequest("https://evil.example", "GET", options).reason, /allowlist/);
  assert.match(inspectRequest("http://codelit.io", "GET", options).reason, /HTTP/);
  assert.match(inspectRequest("https://codelit.io/api", "POST", options).reason, /state-changing/);
  assert.match(inspectRequest("https://user:secret@codelit.io", "GET", options).reason, /credentials/);
});

test("blocks local names unless explicitly allowed", async () => {
  await assert.rejects(assertSafeHost("localhost"), /blocked/);
  await assert.doesNotReject(assertSafeHost("localhost", true));
});
