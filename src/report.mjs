function clean(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function list(values, empty) {
  return values.length ? values.map((value) => "- " + clean(value)).join("\n") : "- " + empty;
}

export function reportMarkdown(report) {
  return [
    "# Browser QA report",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| URL | " + clean(report.finalUrl) + " |",
    "| Title | " + clean(report.page.title) + " |",
    "| Viewport | " + report.viewport.width + " x " + report.viewport.height + " |",
    "| Generated | " + clean(report.generatedAt) + " |",
    "",
    "## Visible structure",
    "",
    "- Headings: " + report.page.headings.length,
    "- Links: " + report.page.linkCount,
    "- Buttons: " + report.page.buttonCount,
    "- Form controls: " + report.page.formControlCount,
    "",
    "## Runtime errors",
    "",
    list(report.consoleErrors, "No console errors captured."),
    "",
    "## Failed requests",
    "",
    list(report.failedRequests.map((entry) => entry.method + " " + entry.url + " - " + entry.reason), "No failed requests captured."),
    "",
    "## Blocked requests",
    "",
    list(report.blockedRequests.map((entry) => entry.method + " " + entry.url + " - " + entry.reason), "No requests were blocked."),
    "",
    "## Horizontal overflow",
    "",
    list(report.page.overflow.map((entry) => entry.selector + " (" + entry.left + " to " + entry.right + ")"), "No viewport overflow detected."),
    "",
    "## Form labels",
    "",
    list(report.page.unlabeledControls, "No unlabeled visible form controls detected."),
    "",
    "Review the screenshot beside this report before treating a run as passed.",
  ].join("\n");
}
