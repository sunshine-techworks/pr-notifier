# PR Notify

**Personal GitHub PR notifications delivered to your Slack DMs**

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](.nvmrc)

[Landing Page](https://sunshinetech.com.au/pr-notify.html) | [Privacy Policy](https://sunshinetech.com.au/pr-notify-privacy.html) | [Support](https://github.com/sunshine-techworks/pr-notifier/issues)

---

## The Problem

GitHub's native Slack integration sends all repository notifications to channels, creating noise where everyone sees everything. Developers lack personalized, filtered notifications for activity relevant to them.

## The Solution

PR Notify delivers only the GitHub PR activity that matters to you, directly to your Slack DMs. Each developer controls exactly which notifications they receive.

## Features

- **Personal DMs** -- notifications go to your Slack DMs, not noisy channels
- **Review requests** -- know immediately when someone requests your review
- **Reviews on your PRs** -- get notified when someone approves, comments, or requests changes
- **Comment notifications** -- human comments on PRs you authored
- **@mention detection** -- notified when you're mentioned in any PR discussion
- **Bot noise filtering** -- automatically detects bot actors (Dependabot, Codecov, etc.) with independent toggle
- **Granular preferences** -- toggle each notification type on/off from the Slack App Home tab
- **Rich Slack messages** -- Block Kit formatted notifications with PR details, branch info, actor avatars, and quick-action buttons
- **Self-service setup** -- users link their own GitHub accounts via `/pr-notify link`

## Quick Start

### For users (hosted version)

1. **Install the Slack app** -- click [Add to Slack](https://sunshinetech.com.au/pr-notify.html) and authorize PR Notify in your workspace
2. **Install the GitHub app** -- add [PR Notify Bot](https://github.com/apps/pr-notify-bot) to your GitHub organization and select your repositories
3. **Link your account** -- run `/pr-notify link your-github-username` in Slack

That's it. You'll start receiving PR notifications via DM.

### Available commands

| Command | Description |
|---------|-------------|
| `/pr-notify link <username>` | Link your GitHub account |
| `/pr-notify prefs` | Open notification preferences (App Home) |
| `/pr-notify help` | Show available commands |

## Architecture

```
GitHub Webhook
    |
    v
API Gateway --> webhook-ingest Lambda --> SQS Queue
                (signature validation,       |
                 payload transformation)     |
                                             v
                                    notification-processor Lambda
                                    (user lookup, preference check,
                                     Slack DM delivery)

Slack Commands/Events
    |
    v
API Gateway --> slack-commands Lambda  (account linking, help)
            --> slack-events Lambda    (App Home, preferences, uninstall)
            --> slack-oauth Lambda     (OAuth install flow)
    |
    v
DynamoDB (users, workspaces)
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22, TypeScript |
| Compute | AWS Lambda (ARM64) |
| API | AWS API Gateway (REST) |
| Database | AWS DynamoDB |
| Queue | AWS SQS |
| Infrastructure | AWS CDK |
| Slack SDK | @slack/web-api |
| Validation | Zod |

### Package Structure

| Package | Description |
|---------|-------------|
| `packages/core` | Shared business logic, types, interfaces, DAOs, clients, and services |
| `packages/lambdas` | Lambda handlers (webhook-ingest, notification-processor, slack-commands, slack-events, slack-oauth) |
| `packages/infra` | AWS CDK infrastructure definitions |

## Development

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- pnpm 9+
- AWS CLI (configured with credentials for deployment)

### Setup

```bash
git clone https://github.com/sunshine-techworks/pr-notifier.git
cd pr-notifier
pnpm install
```

### Commands

```bash
# Build all packages
pnpm build

# Run tests
pnpm -r --filter @pr-notify/core test

# Lint
pnpm lint
pnpm lint:fix

# Format (uses dprint, not prettier)
pnpm format
pnpm format:check

# CDK
pnpm synth     # Synthesize CloudFormation
pnpm deploy    # Deploy to AWS
```

### Code Style

- No semicolons (enforced by ESLint and dprint)
- No `as` type assertions -- use Zod `.parse()` or type guards
- Single quotes
- ES6 imports only
- Import ordering: builtin, external, internal, parent, sibling (with blank lines between groups)

## Self-Hosting

PR Notify can be self-hosted on your own AWS account under the BSL 1.1 license.

### Prerequisites

- AWS account with CLI configured
- A GitHub App (for receiving webhook events)
- A Slack App (for sending notifications)

### Setup Steps

1. **Create a GitHub App** at GitHub Developer Settings
   - Enable webhook events: `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`
   - Set permissions: Pull requests (read), Issues (read)

2. **Create a Slack App** at [api.slack.com](https://api.slack.com/apps)
   - Bot scopes: `chat:write`, `commands`, `users:read`
   - Enable App Home, Event Subscriptions (`app_home_opened`, `app_uninstalled`, `tokens_revoked`), and Interactivity
   - Create the `/pr-notify` slash command

3. **Store secrets in AWS SSM Parameter Store**
   ```bash
   aws ssm put-parameter --name /pr-notify/slack-bot-token --type String --value "xoxb-..."
   aws ssm put-parameter --name /pr-notify/slack-signing-secret --type String --value "..."
   aws ssm put-parameter --name /pr-notify/github-webhook-secret --type String --value "..."
   aws ssm put-parameter --name /pr-notify/slack-client-id --type String --value "..."
   aws ssm put-parameter --name /pr-notify/slack-client-secret --type String --value "..."
   aws ssm put-parameter --name /pr-notify/slack-app-id --type String --value "..."
   ```

4. **Deploy**
   ```bash
   pnpm build
   pnpm deploy
   ```

5. **Configure URLs** -- update your GitHub App and Slack App with the API Gateway endpoints from the CDK output

### Environment Variables

| Variable | Description | Used By |
|----------|-------------|---------|
| `USERS_TABLE_NAME` | DynamoDB users table | All handlers |
| `WORKSPACES_TABLE_NAME` | DynamoDB workspaces table | All handlers |
| `NOTIFICATION_QUEUE_URL` | SQS queue URL | webhook-ingest, notification-processor |
| `SLACK_BOT_TOKEN` | Fallback bot token (migration) | slack-events, notification-processor |
| `SLACK_SIGNING_SECRET` | Slack app signing secret | slack-commands, slack-events |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret | webhook-ingest |
| `SLACK_CLIENT_ID` | Slack OAuth client ID | slack-oauth |
| `SLACK_CLIENT_SECRET` | Slack OAuth client secret | slack-oauth |
| `SLACK_APP_ID` | Slack app ID (for OAuth redirect) | slack-oauth |

## Project Structure

```
pr-notifier/
  packages/
    core/
      src/
        types/          # Zod schemas and TypeScript types
        interfaces/     # DAO, Client, and Service interfaces
        services/       # Business logic (notifications, webhooks, OAuth, workspaces)
        daos/           # DynamoDB data access
        clients/        # Slack API, GitHub API, SQS, logging
        testing/        # Test factories and mocks
    lambdas/
      src/
        webhook-ingest/           # GitHub webhook processing
        notification-processor/   # SQS to Slack DM delivery
        slack-commands/           # /pr-notify slash command
        slack-events/             # App Home, preferences, uninstall
        slack-oauth/              # OAuth install flow
    infra/
      src/
        constructs/     # CDK constructs (API, Database, Lambdas, Queues)
        stacks/         # CDK stack composition
  docs/                 # Landing page and privacy policy
```

## License

PR Notify is licensed under the [Business Source License 1.1](LICENSE).

You are free to use, modify, and self-host PR Notify for your own organization. The only restriction is that you may not offer it as a hosted or managed service to third parties.

Each version converts to the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) four years after its release.

For commercial licensing inquiries, please [contact us](https://github.com/sunshine-techworks/pr-notifier/issues).

---

Built by [Sunshine Techworks](https://sunshinetech.com.au)