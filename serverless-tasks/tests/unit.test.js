// Run with: node --test tests/
// Uses Node.js's built-in test runner (available since Node 18) - no
// dependencies to install, works identically locally and in CI.
const test = require("node:test");
const assert = require("node:assert");

const { validateTitle } = require("../functions/create-task/validate");
const { buildCsv, reportKeyFor } = require("../functions/export-report/csv");

test("validateTitle rejects an empty title", () => {
  const result = validateTitle("");
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.error, "title is required");
});

test("validateTitle rejects a whitespace-only title", () => {
  const result = validateTitle("   ");
  assert.strictEqual(result.valid, false);
});

test("validateTitle trims and accepts a normal title", () => {
  const result = validateTitle("  Buy milk  ");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.title, "Buy milk");
});

test("validateTitle rejects a title over 200 characters", () => {
  const result = validateTitle("a".repeat(201));
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.error, "title must be 200 characters or fewer");
});

test("buildCsv produces a header row even with no tasks", () => {
  const csv = buildCsv([]);
  assert.strictEqual(csv, "id,title,done,createdAt");
});

test("buildCsv includes each task as a row", () => {
  const csv = buildCsv([
    { id: "1", title: "Test task", done: false, createdAt: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.ok(csv.includes("1,"));
  assert.ok(csv.includes("Test task"));
  assert.ok(csv.includes("false"));
});

test("buildCsv escapes double quotes inside a title", () => {
  const csv = buildCsv([
    { id: "1", title: 'Say "hi"', done: false, createdAt: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.ok(csv.includes('Say ""hi""'));
});

test("reportKeyFor produces a date-stamped S3 key", () => {
  const key = reportKeyFor(new Date("2026-03-15T12:00:00.000Z"));
  assert.strictEqual(key, "reports/tasks-report-2026-03-15.csv");
});
