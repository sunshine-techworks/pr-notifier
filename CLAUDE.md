# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build all packages
pnpm build

# Lint
pnpm lint
pnpm lint:fix

# Format (dprint, not prettier)
pnpm format
pnpm format:check

# Test (vitest)
pnpm test
pnpm -r --filter @pr-notify/core test    # Single package
pnpm -r --filter @pr-notify/core test -- --run src/services/user-service.test.ts  # Single test file

# CDK
pnpm synth     # Synthesize CloudFormation
pnpm deploy    # Deploy to AWS
```

## Architecture

PR Notify is a Slack app that sends personalized GitHub PR notifications via DM. It's a pnpm monorepo with three packages:

### Package Structure

- **`packages/core`** - Shared business logic, types, and interfaces
- **`packages/lambdas`** - AWS Lambda handlers (webhook-ingest, notification-processor, slack-commands, slack-events)
- **`packages/infra`** - AWS CDK infrastructure (API Gateway, Lambda, DynamoDB, SQS)

### Data Flow

1. GitHub webhook → API Gateway → `webhook-ingest` Lambda → SQS queue
2. SQS → `notification-processor` Lambda → Slack DM
3. Slack commands/events → API Gateway → `slack-commands`/`slack-events` Lambda → DynamoDB

### Key Patterns

**Interface/Implementation naming**: `UserDao` (interface), `UserDaoImpl` (implementation)

**Zod for validation**: All entity types are inferred from Zod schemas in `core/src/types/entities.ts`. DAOs use `.parse()` for type-safe DynamoDB responses—never use `as` type assertions.

**Layered architecture in core**:

- `types/` - Zod schemas and inferred TypeScript types
- `interfaces/` - DAO, Client, and Service interfaces
- `services/` - Business logic implementations
- `daos/` - DynamoDB implementations
- `clients/` - Slack API, SQS implementations

## Code Style

- **No semicolons** (enforced by ESLint and dprint)
- **No `as` type assertions** - use Zod `.parse()` or type guards
- **Single quotes** for strings
- **ES6 imports only** - no CommonJS
- **Bundler moduleResolution** - imports without `.js` extensions
- **Import ordering** - builtin → external → internal → parent → sibling (with blank lines between groups)
