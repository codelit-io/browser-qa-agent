import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runAudit } from "../src/audit.mjs";

test("captures local evidence while blocking writes", async (context) => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end('<!doctype html><html lang="en"><title>Fixture</title><h1>Browser QA fixture</h1><button>Review</button><script>fetch("/write",{method:"POST"}).catch(()=>{})</script></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const output = await mkdtemp(join(tmpdir(), "codelit-browser-qa-"));
  const result = await runAudit({
    url: "http://127.0.0.1:" + address.port,
    output,
    allowHttp: true,
    allowPrivateNetwork: true,
    settleMs: 100,
  });
  assert.equal(result.report.page.title, "Fixture");
  assert.equal(result.report.page.headings[0].text, "Browser QA fixture");
  assert.ok(result.report.blockedRequests.some((entry) => entry.method === "POST"));
  await access(join(output, "page.png"));
  const json = JSON.parse(await readFile(join(output, "report.json"), "utf8"));
  assert.equal(json.policy.persistentSession, false);
});
