# PR Notify - Implementation TODO

## Overview

This document tracks remaining implementation work based on PRODUCT.md.

---

## Phase 1: Foundation ✅ Partial

### Completed

- [x] Project scaffolding (TypeScript monorepo, pnpm workspaces)
- [x] Lambda handler stubs (webhook-ingest, notification-processor, slack-commands, slack-events)
- [x] CDK infrastructure (API Gateway, Lambdas, SQS with DLQ, DynamoDB)
- [x] Core types with Zod schemas
- [x] DAO implementations (UserDao, WorkspaceDao)
- [x] Service layer (UserService, NotificationService, BotDetectorService)
- [x] Slack client implementation
- [x] SQS notification queue implementation

### Remaining

- [ ] **GitHub App creation and configuration**
  - Create GitHub App in GitHub Developer Settings
  - Configure webhook URL pointing to API Gateway
  - Set up webhook secret for signature verification
  - Enable required events: `pull_request`, `pull_request_review`, `pull_request_review_comment`, `issue_comment`, `check_run`
  - Store App ID, private key, webhook secret in AWS Secrets Manager

- [ ] **Slack App creation and configuration**
  - Create Slack App at api.slack.com
  - Configure OAuth scopes: `chat:write`, `commands`, `users:read`
  - Set up slash command `/pr-notify` pointing to API Gateway
  - Configure Event Subscriptions URL
  - Store Bot Token and Signing Secret in AWS Secrets Manager

- [ ] **Environment/Secrets management**
  - Create AWS Secrets Manager secrets for:
    - `GITHUB_APP_ID`
    - `GITHUB_PRIVATE_KEY`
    - `GITHUB_WEBHOOK_SECRET`
    - `SLACK_BOT_TOKEN`
    - `SLACK_SIGNING_SECRET`
  - Update CDK to pass secrets to Lambdas

- [ ] **Deploy infrastructure**
  - Run `cdk deploy` to create AWS resources
  - Verify API Gateway endpoints are accessible
  - Test webhook signature verification

---

## Phase 2: Core Notifications

### User Linking Flow

- [ ] **Implement `/pr-notify link <github-username>`**
  - Parse slash command text
  - Validate GitHub username exists (call GitHub API)
  - Create/update user record in DynamoDB
  - Return success/error message to Slack

- [ ] **Implement `/pr-notify unlink`**
  - Delete user record from DynamoDB
  - Confirm unlinking to user

### Webhook Processing

- [ ] **Implement webhook-ingest handler**
  - Verify GitHub webhook signature
  - Parse event type from headers
  - Extract relevant data from payload:
    - PR details (number, title, URL, repo)
    - Actor information (username, avatar)
    - Action type (review_requested, submitted, etc.)
  - Look up target user by GitHub username
  - Create Notification object
  - Send to SQS queue
  - Return 200 immediately to GitHub

- [ ] **Implement notification-processor handler**
  - Consume messages from SQS
  - Look up user preferences from DynamoDB
  - Apply notification filtering (shouldNotify logic)
  - Build Slack Block Kit message
  - Send DM via Slack API
  - Handle failures with retry/DLQ

### Notification Types

- [ ] **Review request notifications** (`pull_request.review_requested`)
  - "X requested your review on PR #123"
  - Include PR title, repo, branches

- [ ] **Review submitted notifications** (`pull_request_review.submitted`)
  - "X approved/requested changes/commented on your PR #123"
  - Include review state, PR details

- [ ] **Comment notifications** (`issue_comment.created`, `pull_request_review_comment.created`)
  - "X commented on your PR #123"
  - Include comment snippet (truncated)

- [ ] **@mention notifications**
  - Parse comment/PR body for @mentions
  - Notify mentioned users
  - "X mentioned you in PR #123"

---

## Phase 3: Preferences & Filtering

### Preferences Storage

- [ ] **Implement `/pr-notify prefs`**
  - Return current preferences as formatted message
  - Show ON/OFF status for each notification type

- [ ] **Implement preferences modal**
  - Open Slack modal with toggle switches
  - Handle `view_submission` to save preferences
  - Update user record in DynamoDB

### Bot Filtering

- [ ] **Enhance bot detection**
  - Expand known bots list in `known-bots.ts`
  - Detect `[bot]` suffix in usernames
  - Detect GitHub App actors

- [ ] **Apply bot filtering in notification flow**
  - Check if actor is bot
  - Respect user's `commentsFromBots` preference
  - Filter appropriately

### App Home

- [ ] **Implement app_home_opened handler**
  - Build App Home view with:
    - Linked GitHub account status
    - Current preferences with toggles
    - Quick actions (unlink, etc.)
  - Publish view via `views.publish`

- [ ] **Handle block_actions from App Home**
  - Process preference toggle changes
  - Update DynamoDB
  - Refresh App Home view

---

## Phase 4: Nice-to-Have Features

### Catch-up Command

- [ ] **Implement `/pr-notify catchup`**
  - Query GitHub API for:
    - Open review requests for user
    - User's PRs with recent activity
    - Recent @mentions
  - Format as Slack message with summary
  - Requires storing GitHub OAuth token (new flow)

### Daily Digest

- [ ] **Add digest preferences**
  - `digestEnabled`: boolean
  - `digestTime`: HH:mm format
  - `timezone`: IANA timezone string

- [ ] **Create digest Lambda**
  - Triggered by CloudWatch Events (cron)
  - Query users with digest enabled
  - For each user at their digest time:
    - Fetch pending items from GitHub API
    - Send digest DM

### Quiet Hours

- [ ] **Add quiet hours preferences**
  - `quietHours.start`: HH:mm
  - `quietHours.end`: HH:mm
  - `quietHours.timezone`: string

- [ ] **Apply quiet hours in notification flow**
  - Check current time in user's timezone
  - If in quiet hours, drop notification (don't queue)

### Smart Batching

- [ ] **Implement notification batching**
  - Track recent notifications per user/PR
  - If multiple events within 5 minutes from same actor:
    - Combine into single notification
  - Requires short-term state (DynamoDB TTL or Redis)

### Notification Deduplication

- [ ] **Detect overlapping events**
  - Review with comment → single notification
  - Track event IDs to prevent duplicates
  - Use DynamoDB with TTL for dedup window

---

## Phase 5: Commercialization

### Multi-tenancy

- [ ] **Workspace management**
  - Track workspace installs via `app_installed` event
  - Handle `app_uninstalled` for cleanup
  - Associate users with workspaces

- [ ] **Usage tracking**
  - Count users per workspace
  - Track notification volume
  - Store in Workspaces table

### Billing Integration

- [ ] **Stripe setup**
  - Create Stripe account and products
  - Define price tiers (Free, Pro $4/user/mo, Enterprise)
  - Set up webhook endpoint for Stripe events

- [ ] **Subscription management**
  - Create checkout session for upgrades
  - Handle `checkout.session.completed`
  - Handle `customer.subscription.updated/deleted`
  - Store `stripeCustomerId`, `stripeSubscriptionId`

- [ ] **Feature gating**
  - Check workspace tier before:
    - Allowing >5 users (Free limit)
    - Enabling catch-up command
    - Enabling daily digest
    - Enabling quiet hours

### Landing Page

- [ ] **Marketing site**
  - Hero section with value prop
  - Feature comparison table
  - Pricing section
  - "Add to Slack" button
  - Privacy policy and Terms of Service links

### Slack App Directory

- [ ] **Prepare for submission**
  - Write privacy policy
  - Write terms of service
  - Create support documentation
  - Add app icon and screenshots
  - Submit for Slack review

### Analytics

- [ ] **Track key metrics**
  - Installs / uninstalls
  - User activations (linked accounts)
  - Notification delivery rate
  - Feature usage by tier
  - Conversion funnel (free → paid)

---

## Infrastructure & DevOps

### Testing

- [ ] **Unit tests**
  - Services (UserService, NotificationService, BotDetectorService)
  - DAOs (mock DynamoDB)
  - Webhook payload parsing

- [ ] **Integration tests**
  - End-to-end webhook flow
  - Slack command handling

### CI/CD

- [ ] **GitHub Actions workflow**
  - Run tests on PR
  - Lint and type-check
  - Deploy to staging on merge to main
  - Manual production deploy

### Monitoring

- [ ] **CloudWatch dashboards**
  - Lambda invocations and errors
  - SQS queue depth
  - DLQ message count
  - API Gateway latency

- [ ] **Alerts**
  - DLQ has messages
  - Lambda error rate spike
  - High latency

### Security

- [ ] **Audit secrets handling**
  - Ensure no secrets in code/logs
  - Rotate secrets periodically

- [ ] **Rate limiting**
  - API Gateway throttling
  - Per-user notification limits

---

## Quick Reference: What to Build Next

**Recommended order for MVP:**

1. ⬜ Create GitHub App + Slack App (manual setup)
2. ⬜ Set up secrets in AWS
3. ⬜ Deploy infrastructure (`cdk deploy`)
4. ⬜ Implement `/pr-notify link` command
5. ⬜ Implement webhook-ingest (parse + queue)
6. ⬜ Implement notification-processor (send Slack DMs)
7. ⬜ Test end-to-end with real webhook
8. ⬜ Add remaining notification types
9. ⬜ Implement preferences UI
10. ⬜ Add bot filtering

**Post-MVP:**

- Catch-up command
- Daily digest
- Quiet hours
- Commercialization
