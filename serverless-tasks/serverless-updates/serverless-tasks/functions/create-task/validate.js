// Pure function, no AWS calls - kept separate from index.js so it can be
// unit tested directly without mocking DynamoDB/SQS.
function validateTitle(title) {
  const trimmed = (title || "").trim();
  if (!trimmed) {
    return { valid: false, error: "title is required" };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: "title must be 200 characters or fewer" };
  }
  return { valid: true, title: trimmed };
}

module.exports = { validateTitle };
