# PR Notify

**Personal GitHub PR notifications for Slack**

A Slack app that delivers personalized GitHub PR notifications via DM, giving developers control over what notifications they receive and reducing noise.

> **Tagline for marketplace**: "Get personal Slack DMs for GitHub PR reviews, mentions, and comments. Filter bot noise, set quiet hours, never miss a review request."

## Problem Statement

The standard GitHub Slack app sends all repository notifications to channels, creating noise where everyone sees everything. Developers lack personalized, filtered notifications for activity relevant to them.

## Value Proposition

**Personalized, relevant DMs** - Users receive only the GitHub notifications they care about, with granular control over notification types.

## Target Users

Individual developers who want to:

- Know immediately when someone requests their review
- Get notified when their PRs receive reviews or comments
- Filter out bot noise while staying informed about human activity
- Not miss @mentions in PR discussions

## Core Features (MVP)

### 1. Self-Service Account Linking

Users link their GitHub account to Slack without admin intervention.

- Slash command: `/pr-notify link <github-username>`
- Validates the GitHub username exists
- Stores the GitHub username ↔ Slack user ID mapping

### 2. Granular Notification Preferences

Users configure which notifications they receive via slash command or app home.

| Notification Type           | Default | Description                                     |
| --------------------------- | ------- | ----------------------------------------------- |
| Review requests             | ON      | Someone requests your review on a PR            |
| Reviews on my PRs           | ON      | Someone approves, comments, or requests changes |
| Comments on my PRs (humans) | ON      | Human comments on PRs you authored              |
| Comments on my PRs (bots)   | OFF     | Bot comments (CI, coverage, linting)            |
| @mentions                   | ON      | You're mentioned in a PR description or comment |
| CI failures on my PRs       | OFF     | CI/checks fail on PRs you authored              |

### 3. Bot vs Human Comment Filtering

Distinguishes between human developers and bots using GitHub's API:

- GitHub webhook payloads include `sender.type` field (`User`, `Bot`, or `Organization`)
- Fallback: usernames ending in `[bot]` suffix
- Users can toggle bot notifications independently

### 4. Rich Slack Notifications

Notifications use Slack Block Kit with:

- Clear header indicating notification type
- PR title and number
- Who triggered the notification (with avatar)
- Repository name
- Branch information
- Action buttons: "View PR", "Review Changes"

### 5. Repo-to-Channel Mapping (Personal Scope)

Users can optionally route notifications from specific repos to specific channels they're in.

- `/pr-notify route clipboard/api #my-api-work`
- Default: All notifications go to DM

## Nice-to-Have Features (Post-MVP)

### 1. Catch-up Command

On-demand summary of pending items.

```
/pr-notify catchup
```

Returns:

- Open review requests waiting on you
- PRs you authored with unread comments
- Recent @mentions

This queries GitHub API in real-time (not stored history).

### 2. Daily Digest

Optional morning summary of pending items.

- Configurable time and timezone
- Same content as catch-up but delivered automatically
- Can be disabled

### 3. Quiet Hours

Suppress notifications during configured hours.

- Per-user schedule (e.g., 6pm - 9am)
- Timezone-aware
- Notifications are dropped (not queued)

### 4. Smart Batching

Aggregate rapid-fire notifications.

- Multiple comments from same user within 5 minutes → single notification
- Reduces spam during active PR discussions

### 5. Interactive Actions (Future)

Quick actions directly from Slack:

- Approve PR
- Request changes
- Add quick comment

### 6. Notification Deduplication

Handle overlapping GitHub events intelligently:

- Review with comment → single notification (not two)
- Multiple reviews from same person within short window → batched
- Prevents duplicate alerts for the same logical action

## Technical Architecture

### Stack

| Component          | Technology              |
| ------------------ | ----------------------- |
| Runtime            | Node.js with TypeScript |
| Slack SDK          | Bolt for JavaScript     |
| GitHub Integration | GitHub App + Octokit    |
| Compute            | AWS Lambda              |
| API Layer          | AWS API Gateway         |
| Database           | AWS DynamoDB            |
| Queue              | AWS SQS (with DLQ)      |
| IaC                | AWS CDK or SAM          |

### Architecture Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│    GitHub    │     │ API Gateway  │     │   Lambda     │     │    SQS      │
│   Webhooks   │────▶│  (webhook)   │────▶│  (ingest)    │────▶│  (queue)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬──────┘
                                                                      │
                     ┌──────────────┐     ┌──────────────┐            │
                     │    Slack     │◀────│   Lambda     │◀───────────┘
                     │  Block Kit   │     │  (process)   │
                     └──────────────┘     └──────┬───────┘
                                                 │ (on failure)
┌──────────────┐     ┌──────────────┐            ▼
│    Slack     │     │ API Gateway  │     ┌──────────────┐     ┌─────────────┐
│  Commands &  │────▶│  (slash cmd) │     │   SQS DLQ    │────▶│  CloudWatch │
│  App Home    │     └──────────────┘     │  (failures)  │     │   Alarm     │
└──────────────┘            │             └──────────────┘     └─────────────┘
                            ▼
                     ┌──────────────┐
                     │  DynamoDB    │
                     │  - users     │
                     │  - workspaces│
                     │  - prefs     │
                     └──────────────┘
```

**Reliability flow:**

1. Webhook Lambda validates payload and immediately queues to SQS (fast 200 response to GitHub)
2. Processor Lambda reads from SQS, looks up user prefs, sends to Slack
3. On Slack API failure, message returns to queue with exponential backoff (3 retries)
4. After 3 failures, message moves to DLQ for investigation
5. CloudWatch alarm triggers when DLQ has messages

### Lambda Functions

| Function                 | Trigger              | Purpose                                  |
| ------------------------ | -------------------- | ---------------------------------------- |
| `webhook-ingest`         | API Gateway (GitHub) | Validate webhook, queue to SQS           |
| `notification-processor` | SQS                  | Look up user, apply prefs, send to Slack |
| `slack-commands`         | API Gateway (Slack)  | Handle slash commands                    |
| `slack-events`           | API Gateway (Slack)  | Handle app home, interactive components  |

### DynamoDB Tables

#### Users Table

```
PK: SLACK_USER#{slackUserId}
Attributes:
  - githubUsername: string
  - preferences: map (notification toggles)
  - quietHours: map (optional)
  - digestEnabled: boolean
  - digestTime: string (HH:mm)
  - timezone: string
  - createdAt: string (ISO)
  - updatedAt: string (ISO)

GSI: GitHubUsername-index
  PK: githubUsername
  Projects: slackUserId
```

#### Repo Routes Table (if implementing per-repo routing)

```
PK: SLACK_USER#{slackUserId}
SK: REPO#{owner/repo}
Attributes:
  - channelId: string
```

### GitHub Webhooks Required

| Event                         | Actions                  | Purpose                  |
| ----------------------------- | ------------------------ | ------------------------ |
| `pull_request`                | opened, review_requested | New PRs, review requests |
| `pull_request_review`         | submitted                | Reviews on PRs           |
| `pull_request_review_comment` | created                  | Review comments          |
| `issue_comment`               | created                  | PR conversation comments |
| `check_run`                   | completed                | CI failures (optional)   |

### Slack App Configuration

#### Scopes Required

- `chat:write` - Send DMs
- `commands` - Slash commands
- `users:read` - Look up user info

#### Slash Commands

| Command                      | Description             |
| ---------------------------- | ----------------------- |
| `/pr-notify link <username>` | Link GitHub account     |
| `/pr-notify prefs`           | Open preferences modal  |
| `/pr-notify catchup`         | Show pending items      |
| `/pr-notify help`            | Show available commands |

## Comparison with Alternatives

| Feature              | This App | GitHub Slack App | PullNotifier |
| -------------------- | -------- | ---------------- | ------------ |
| Personal DMs         | Yes      | Limited          | Yes          |
| Bot/human filtering  | Yes      | No               | No           |
| User-managed prefs   | Yes      | No               | Partial      |
| Catch-up command     | Yes      | No               | No           |
| Self-service linking | Yes      | N/A (org level)  | Yes          |
| Quiet hours          | Planned  | No               | No           |
| Pricing              | Freemium | Free             | Freemium     |

## Open Questions

1. **Org-wide vs personal install**: Start with personal workspace install or target org-wide from day one?
2. **Rate limiting**: How to handle webhook storms during busy periods?
3. **Multi-org support**: Should one Slack workspace connect to multiple GitHub orgs?

## Success Metrics

- User activation rate (linked accounts / installs)
- Notification delivery success rate
- Preference customization rate (users who change defaults)
- User retention (weekly active users)
- Conversion rate (free to paid)
- Monthly recurring revenue (MRR)

## Commercialization

### Pricing Tiers

| Feature             | Free | Pro        | Enterprise |
| ------------------- | ---- | ---------- | ---------- |
| Users per workspace | 5    | Unlimited  | Unlimited  |
| Core notifications  | Yes  | Yes        | Yes        |
| Bot/human filtering | Yes  | Yes        | Yes        |
| Catch-up command    | No   | Yes        | Yes        |
| Daily digest        | No   | Yes        | Yes        |
| Quiet hours         | No   | Yes        | Yes        |
| Smart batching      | No   | Yes        | Yes        |
| Priority support    | No   | No         | Yes        |
| SSO/SAML            | No   | No         | Yes        |
| SLA guarantee       | No   | No         | Yes        |
| **Price**           | $0   | $4/user/mo | Custom     |

### Requirements for Commercialization

| Area              | What's Needed                                                       |
| ----------------- | ------------------------------------------------------------------- |
| **Multi-tenancy** | Isolate data per Slack workspace, track usage per workspace         |
| **Billing**       | Stripe integration for subscriptions, usage tracking, invoicing     |
| **Tier gating**   | Feature flags per workspace based on subscription tier              |
| **Auth**          | OAuth flow for Slack App Directory distribution                     |
| **Legal**         | Privacy policy, terms of service, GDPR/CCPA compliance              |
| **Landing page**  | Marketing site with pricing, features, testimonials, install button |
| **Analytics**     | Track installs, active users, feature usage, conversion funnel      |
| **Support**       | Help docs, FAQ, contact form, possibly Intercom/Crisp for chat      |
| **Security**      | SOC2 Type II for enterprise customers (future)                      |

### DynamoDB Additions for Billing

#### Workspaces Table

```
PK: WORKSPACE#{slackWorkspaceId}
Attributes:
  - name: string
  - tier: enum (free, pro, enterprise)
  - stripeCustomerId: string
  - stripeSubscriptionId: string
  - userCount: number
  - installedAt: string (ISO)
  - billingEmail: string
```

### Slack App Directory

To distribute via Slack App Directory:

1. Submit app for review (requires privacy policy, support URL)
2. Enable OAuth 2.0 for workspace installs
3. Handle `app_uninstalled` event for cleanup
4. Provide clear onboarding flow post-install

## Development Phases

### Phase 1: Foundation

- [ ] Project scaffolding (TypeScript, Lambda, CDK)
- [ ] GitHub App creation and configuration
- [ ] Slack App creation and configuration
- [ ] DynamoDB table setup
- [ ] Basic webhook handler (log events)

### Phase 2: Core Notifications

- [ ] User linking flow (`/pr-notify link`)
- [ ] Review request notifications
- [ ] Review submitted notifications
- [ ] @mention notifications

### Phase 3: Preferences & Filtering

- [ ] Preferences storage and retrieval
- [ ] Preferences UI (slash command or modal)
- [ ] Bot vs human comment filtering
- [ ] Apply preferences to notification flow

### Phase 4: Nice-to-Haves

- [ ] Catch-up command
- [ ] Daily digest
- [ ] Quiet hours
- [ ] Smart batching

### Phase 5: Commercialization

- [ ] Workspaces table and tier tracking
- [ ] Stripe integration (subscriptions, webhooks)
- [ ] Feature gating based on tier
- [ ] Landing page with pricing
- [ ] Privacy policy and terms of service
- [ ] Slack App Directory submission
- [ ] Usage analytics dashboard
