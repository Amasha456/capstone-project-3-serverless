# Project 3 Report: Architecture, Security, Scalability, Reliability, Limitations, Cost

## Architecture
The system is a fully event-driven serverless application with four Lambda
functions, each with a single, clear responsibility, triggered three
different ways: two behind API Gateway (HTTP), one behind SQS (event), and
one behind EventBridge (schedule). This separation means each piece scales,
fails, and can be redeployed independently - creating a task and generating
a report are entirely decoupled processes that never block each other.
DynamoDB was chosen over a relational database for its pay-per-request
pricing and zero idle cost, which matches a low/unpredictable-traffic
workload far better than a provisioned database would.

## Security
Write access is gated behind an API Gateway API key tied to a usage plan,
which both authenticates requests and rate-limits them (10 req/s,
20-request burst) - a single mechanism doing double duty. Each function has
its own narrowly-scoped IAM role rather than one shared role, generated
automatically by SAM's policy templates (e.g. the notification function can
only read from its one queue; it has no DynamoDB or S3 access at all, since
it doesn't need any).

The most significant gap, documented honestly rather than hidden, is that
deployment access (both the local AWS CLI and the GitHub Actions pipeline)
used the AWS account's root credentials, the same tradeoff made in Project 1
under the same time constraint. The read endpoint is also intentionally
left open with no auth, since this demo has no user-account concept - a
real multi-tenant version would need per-user authentication (Cognito) on
both routes, not just the write path.

## Scalability
Every component in this architecture scales automatically and
independently with no configuration: Lambda scales concurrency to match
incoming request volume, DynamoDB's pay-per-request billing mode scales
read/write capacity automatically, and SQS/API Gateway both handle bursts
natively. This is a structurally different scalability story than
Project 1's Kubernetes deployment, where a real, observed limit was hit
(node pod-count capacity) during load testing. Nothing analogous was
possible to hit here at the traffic levels tested - the closest thing to a
scalability concern is the `GET /tasks` endpoint's use of a DynamoDB
`Scan`, which reads every item in the table regardless of how many tasks
exist; this works fine at demo scale but would need to become a `Query`
against a proper access pattern (e.g. by status or date) well before the
table reached meaningful size.

## Reliability
The clearest reliability feature built and *tested* (not just configured)
is the SQS Dead Letter Queue on the notification path. A deliberate test
hook was built into `processNotification` so a task titled with the word
"fail" throws an error on purpose; this was used to confirm, via
CloudWatch Logs, that SQS retried the failed message three times
(matching the queue's configured `maxReceiveCount`) roughly 30 seconds
apart before routing it to the `task-notifications-dlq` queue, confirmed
directly via `aws sqs get-queue-attributes`. This means a broken downstream
notification service can't silently swallow events forever, and a message
that does eventually fail is preserved for manual inspection or reprocessing
rather than lost.

## Limitations
- No authentication on the read endpoint (see Security).
- Root account credentials used for deployment (see Security).
- `GET /tasks` scans the whole table rather than using a scalable query
  pattern - fine now, a real constraint later.
- The Lambda runtime, `nodejs20.x`, is on AWS's deprecation timeline
  (surfaced by `sam validate --lint` during CI/CD setup) and should be
  bumped to `nodejs22.x` in a future revision.
- No staging environment - every push to `main` deploys straight to the
  only environment that exists.
- The notification function only logs to CloudWatch rather than actually
  sending a real notification (email/Slack/SMS) - intentional scope
  limitation for this demo, but would be the next real feature to add.

## Cost
This architecture's defining cost characteristic, compared directly against
Project 1's EKS deployment, is that **nothing bills while idle**. Every
component (Lambda, API Gateway, DynamoDB pay-per-request, SQS, S3,
EventBridge) is billed per-request or per-resource-consumed rather than
per-hour, and at this project's testing volume every component stayed
within AWS's perpetual free tier. Project 1's EKS cluster, by contrast,
billed roughly $0.20-0.25/hour continuously regardless of whether the app
was receiving any traffic, which is why it had to be manually deleted
between work sessions to control cost. At low or bursty traffic - exactly
this project's profile - the serverless architecture is straightforwardly
cheaper and required no manual cost-management discipline to keep it that
way.
