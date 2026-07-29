#!/usr/bin/env node
import { runAudit } from "../src/audit.mjs";

function usage() {
  console.log(`Browser QA Agent

Usage:
  browser-qa <https-url> [options]

Options:
  --allow-host <host>          Allow an additional exact host (repeatable)
  --output <directory>         Artifact directory (default: artifacts/browser-qa)
  --light                      Use light color preference
  --allow-http                 Permit HTTP (intended for local fixtures)
  --allow-private-network      Permit private/local destinations
  --help                       Show this help

The browser is ephemeral and unsigned. Non-GET/HEAD/OPTIONS requests are blocked.`);
}

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}
const options = { url: args[0], allowedHosts: [] };
for (let index = 1; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--allow-host") options.allowedHosts.push(args[++index]);
  else if (arg === "--output") options.output = args[++index];
  else if (arg === "--light") options.colorScheme = "light";
  else if (arg === "--allow-http") options.allowHttp = true;
  else if (arg === "--allow-private-network") options.allowPrivateNetwork = true;
  else throw new Error("Unknown option: " + arg);
}

const result = await runAudit(options);
console.log("Browser QA artifacts: " + result.output);
console.log("Blocked requests: " + result.report.blockedRequests.length);
console.log("Console errors: " + result.report.consoleErrors.length);
console.log("Overflow candidates: " + result.report.page.overflow.length);
