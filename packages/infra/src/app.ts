#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'

import { PrNotifyStack } from './stacks/pr-notify-stack'

// CDK app entry point
// Creates the main PR Notify stack with all infrastructure resources
const app = new cdk.App()

// Build environment config, only including properties if they have values
// This satisfies exactOptionalPropertyTypes
const cdkAccount = process.env['CDK_DEFAULT_ACCOUNT']
const cdkRegion = process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1'

new PrNotifyStack(app, 'PrNotifyStack', {
  env: {
    // Only include account if defined (satisfies exactOptionalPropertyTypes)
    ...(cdkAccount ? { account: cdkAccount } : {}),
    region: cdkRegion,
  },
  description: 'PR Notify - GitHub PR notification service for Slack',
})

app.synth()
