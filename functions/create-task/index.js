// Relies on AWS SDK v3, which is bundled into the Lambda Node.js 20.x runtime,
// so no npm install / node_modules is required for this function.
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { randomUUID } = require("crypto");
const { validateTitle } = require("./validate");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const QUEUE_URL = process.env.QUEUE_URL;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const check = validateTitle(body.title);

    if (!check.valid) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: check.error }),
      };
    }

    const task = {
      id: randomUUID(),
      title: check.title,
      done: false,
      createdAt: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: task }));

    // Publish an event so the notification function can process it
    // asynchronously, decoupled from the API response.
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify({ type: "TASK_CREATED", task }),
      })
    );

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    };
  } catch (err) {
    console.error("createTask error", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "internal server error" }),
    };
  }
};
