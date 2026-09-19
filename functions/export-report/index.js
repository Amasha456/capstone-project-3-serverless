// Triggered on a schedule (see template.yaml EventBridge rule). Reads all
// tasks from DynamoDB, builds a CSV summary, and uploads it to S3 -
// demonstrating object storage + a scheduled/event-driven trigger.
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { buildCsv, reportKeyFor } = require("./csv");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

exports.handler = async () => {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
  const items = result.Items || [];

  const csv = buildCsv(items);
  const key = reportKeyFor();

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: csv,
      ContentType: "text/csv",
    })
  );

  console.log(`Report written to s3://${BUCKET_NAME}/${key} (${items.length} tasks)`);
  return { reportKey: key, taskCount: items.length };
};
