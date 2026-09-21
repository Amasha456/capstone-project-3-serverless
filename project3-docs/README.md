# Capstone Project 3: Serverless Task Management System

## Overview
An event-driven serverless REST API for managing tasks, built entirely on
AWS Lambda, API Gateway, DynamoDB, SQS, S3, and EventBridge, deployed with
AWS SAM and automatically built/tested/deployed via GitHub Actions.

## Business Problem
A lightweight backend for a task-tracking tool that needs to scale to zero
when idle (no cost, no servers to manage) and scale automatically under
load, while also handling background work (sending notifications, producing
periodic reports) without blocking the API response to the user.

## Architecture
```
Client
  |
  v
API Gateway (API key required on write access)
  |
  +-- POST /tasks --> createTask Lambda --> DynamoDB (Tasks table)
  |                                     \--> SQS (task-notifications queue)
  |
  +-- GET /tasks  --> listTasks Lambda  --> DynamoDB (Tasks table)

SQS task-notifications queue
  |
  +-- triggers --> processNotification Lambda
                   (on repeated failure, after 3 attempts, message moves to
                    the task-notifications-dlq Dead Letter Queue instead of
                    being silently dropped)

EventBridge (daily schedule, rate(1 day))
  |
  +-- triggers --> exportReport Lambda --> DynamoDB (read all tasks)
                                       --> S3 (writes a CSV report)
```
Four Lambda functions, three distinct trigger types (HTTP via API Gateway,
event-driven via SQS, and scheduled via EventBridge).
![Architecture diagram](architecture.svg)

## Technologies Used
- **Compute**: AWS Lambda (Node.js 20.x)
- **API**: Amazon API Gateway (REST API, API key + usage plan for
  authentication/rate limiting)
- **Database**: Amazon DynamoDB (pay-per-request)
- **Messaging**: Amazon SQS (main queue + Dead Letter Queue)
- **Storage**: Amazon S3 (generated CSV reports)
- **Scheduling**: Amazon EventBridge (daily rule)
- **IaC / deployment**: AWS SAM (Serverless Application Model)
- **CI/CD**: GitHub Actions
- **Testing**: Node.js's built-in test runner (`node --test`), no external
  test framework dependency

## Prerequisites
- AWS account with billing enabled
- AWS CLI v2, configured (`aws configure`)
- AWS SAM CLI
- Node.js 20.x (for running tests locally; not required for deployment,
  since the Lambda runtime already bundles the AWS SDK v3)

## Installation Instructions
```bash
git clone <this-repo-url>
cd capstone-project-3-serverless
sam build
```

## Deployment Instructions
```bash
sam deploy --guided
```
On first run this asks for a stack name, region, and whether to save the
answers to `samconfig.toml` (recommended - subsequent deploys are then just
`sam deploy`). After deploying, the API URL and other resource identifiers
are printed as CloudFormation stack outputs:
```bash
aws cloudformation describe-stacks --stack-name capstone-serverless-tasks \
  --region eu-central-1 --query "Stacks[0].Outputs"
```

## API Documentation
Base URL: `https://<api-id>.execute-api.eu-central-1.amazonaws.com/prod`

| Method | Path     | Auth required | Description |
|--------|----------|---------------|--------------|
| POST   | /tasks   | Yes (`x-api-key` header) | Create a task. Body: `{"title": "..."}` |
| GET    | /tasks   | No            | List all tasks |

Example:
```bash
curl -X POST https://<api-id>.execute-api.eu-central-1.amazonaws.com/prod/tasks \
  -H "x-api-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'
```
The API key is retrievable via:
```bash
aws apigateway get-api-keys --include-values --region eu-central-1
```

## Testing Instructions
- **Unit tests** (validation logic and CSV-building logic, no AWS calls
  needed): `node --test tests/unit.test.js` - 8 tests, all passing. These
  also run automatically in the CI/CD pipeline before every deploy.
- **End-to-end, against the live deployment**:
  - Create a task via `POST /tasks` and confirm it's returned with an `id`.
  - List tasks via `GET /tasks` and confirm the new task appears.
  - Confirm the notification function fired by checking its CloudWatch Logs
    for a `Notification: task "..." was created` line.
  - **Failure/DLQ path**: create a task with the word "fail" in its title
    (a deliberate test hook built into `processNotification`) - this
    simulates a downstream failure. Confirm in CloudWatch Logs that it
    retried 3 times, then confirm the message landed in the DLQ:
    `aws sqs get-queue-attributes --queue-url <dlq-url> --attribute-names ApproximateNumberOfMessages`
  - **Scheduled report**: manually invoke `exportReport` with
    `aws lambda invoke --function-name <function-name> out.json` and
    confirm a CSV appears in the S3 bucket under `reports/`.

## Security Considerations
- Write access (`POST /tasks`) requires an API key tied to a usage plan
  with request throttling (rate limit 10 req/s, burst 20) - this both
  authenticates and rate-limits the write path.
- Each Lambda function has its own least-privilege IAM role, generated
  automatically by SAM's policy templates (e.g. `DynamoDBCrudPolicy`,
  `SQSSendMessagePolicy`) rather than a single broad role shared across
  functions.
- **Known limitation**: read access (`GET /tasks`) is intentionally left
  public with no API key, since this demo has no concept of user accounts;
  a real deployment would put both routes behind proper authentication
  (e.g. Amazon Cognito) rather than a shared API key.
- **Known limitation**: as with Project 1, AWS CLI/CI deployment access
  used root account credentials due to time constraints; a production setup
  should use a scoped IAM user or an OIDC-based GitHub Actions role instead.
- Secrets (AWS credentials for CI/CD) are stored as GitHub Actions
  repository secrets, never committed to the repo.

## Monitoring Strategy
Every Lambda function automatically logs to its own CloudWatch Logs group
(no extra setup needed - this is built into the Lambda service). The
`processNotification` function's logs were used directly during testing to
confirm both the success path and the retry/failure path. CloudWatch
metrics (invocation count, errors, duration, throttles) are available per
function and per API route without additional configuration.

## Cost Considerations
This architecture is close to zero-cost at low/demo traffic levels, since
every component is either free-tier eligible or billed per-request rather
than per-hour:
| Component | Pricing model | Approx. cost at this project's usage |
|---|---|---|
| Lambda (4 functions) | Per request + per ms compute | Within free tier (1M requests/month free) |
| API Gateway | Per request | ~$3.50 per million requests (well within free tier at demo volume) |
| DynamoDB | Pay-per-request | Within free tier (25 free reads/writes) |
| SQS | Per request | Within free tier (1M requests/month free) |
| S3 | Per GB stored + per request | Negligible for a few small CSV files |
| EventBridge | Per rule/event | Negligible (1 rule firing once daily) |

Unlike Project 1's EKS cluster (which bills hourly for the control plane
and nodes regardless of traffic), this serverless architecture has **no
idle cost** - nothing was running (and therefore nothing was billing)
between testing sessions, which is a genuine cost advantage of this
architecture over the Kubernetes one for a low/variable-traffic workload.

## Cleanup Instructions
```bash
sam delete --stack-name capstone-serverless-tasks --region eu-central-1
```
This removes every resource the stack created (Lambda functions, API
Gateway, DynamoDB table, SQS queues, EventBridge rule) except the S3
bucket if it still contains objects - empty it first if needed:
```bash
aws s3 rm s3://capstone-task-reports-448049824779 --recursive
```

## Known Limitations
- No authentication on the read (`GET /tasks`) endpoint.
- Used AWS root account credentials rather than a scoped IAM user (see
  Security Considerations).
- No pagination on `GET /tasks` - a `Scan` against DynamoDB doesn't scale
  well past a few thousand items; a production version should use `Query`
  with a proper access pattern and pagination.
- The Lambda runtime (`nodejs20.x`) is approaching AWS's deprecation
  timeline; a future update should move to `nodejs22.x`.
- No staging environment - the CI/CD pipeline deploys straight to the only
  environment on every push to `main`.
