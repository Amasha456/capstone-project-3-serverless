// Pure function, no AWS calls - kept separate from index.js so it can be
// unit tested directly without mocking DynamoDB/S3.
function buildCsv(items) {
  const header = "id,title,done,createdAt";
  const rows = items.map(
    (t) => `${t.id},"${(t.title || "").replace(/"/g, '""')}",${t.done},${t.createdAt}`
  );
  return [header, ...rows].join("\n");
}

function reportKeyFor(date = new Date()) {
  return `reports/tasks-report-${date.toISOString().slice(0, 10)}.csv`;
}

module.exports = { buildCsv, reportKeyFor };
