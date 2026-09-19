// Triggered by SQS. Simulates sending a notification (e.g. email/Slack) for
// each newly created task. A message that fails processing is automatically
// retried by SQS, and after maxReceiveCount attempts (see template.yaml)
// it's routed to the Dead Letter Queue instead of being silently lost.
exports.handler = async (event) => {
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);

      // Deliberate test hook: a task titled containing "fail" simulates a
      // downstream notification failure, to demonstrate the DLQ/retry path
      // without needing a real external service to break.
      if (message.task && message.task.title.toLowerCase().includes("fail")) {
        throw new Error("Simulated notification delivery failure");
      }

      console.log(
        `Notification: task "${message.task.title}" (id ${message.task.id}) was created`
      );
    } catch (err) {
      console.error("processNotification error, will retry/DLQ", err.message);
      // Re-throwing marks this record as failed, so SQS retries it and
      // eventually moves it to the DLQ per the queue's redrive policy.
      throw err;
    }
  }
};
