import * as cdk from 'aws-cdk-lib'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import type { Construct } from 'constructs'

export interface ApiConstructProps {
  webhookIngestLambda: lambda.Function
  slackCommandsLambda: lambda.Function
  slackEventsLambda: lambda.Function
  slackOAuthLambda: lambda.Function
  githubOAuthLambda: lambda.Function
}

/**
 * API Gateway construct for PR Notify
 * Creates REST API with routes for GitHub webhooks and Slack interactions
 */
export class ApiConstruct extends cdk.NestedStack {
  public readonly api: apigateway.RestApi

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id)

    // Create REST API with sensible defaults
    this.api = new apigateway.RestApi(this, 'PrNotifyApi', {
      restApiName: 'PR Notify API',
      description: 'API Gateway for PR Notify webhooks and Slack interactions',
      deployOptions: {
        stageName: 'prod',
        // Enable CloudWatch logging for debugging
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      // Enable CORS for Slack interactions
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
      },
    })

    // GitHub webhook endpoint
    // POST /webhooks/github - receives webhook events from GitHub App
    const webhooksResource = this.api.root.addResource('webhooks')
    const githubWebhookResource = webhooksResource.addResource('github')
    githubWebhookResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.webhookIngestLambda, {
        // Use proxy integration for full request/response control
        proxy: true,
      }),
    )

    // Slack endpoints
    // POST /slack/commands - slash command handler
    // POST /slack/events - Events API handler
    // POST /slack/interactions - Block actions and interactive components
    const slackResource = this.api.root.addResource('slack')

    const slackCommandsResource = slackResource.addResource('commands')
    slackCommandsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.slackCommandsLambda, {
        proxy: true,
      }),
    )

    const slackEventsResource = slackResource.addResource('events')
    slackEventsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.slackEventsLambda, {
        proxy: true,
      }),
    )

    // Interactions endpoint uses the same events Lambda
    // Block actions and interactive components come through here
    const slackInteractionsResource = slackResource.addResource('interactions')
    slackInteractionsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(props.slackEventsLambda, {
        proxy: true,
      }),
    )

    // OAuth endpoints for workspace installation
    // GET /slack/oauth/authorize - redirects to Slack's authorization page
    // GET /slack/oauth/callback - handles the redirect from Slack after authorization
    const slackOAuthResource = slackResource.addResource('oauth')

    const slackOAuthAuthorizeResource = slackOAuthResource.addResource('authorize')
    slackOAuthAuthorizeResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.slackOAuthLambda, {
        proxy: true,
      }),
    )

    const slackOAuthCallbackResource = slackOAuthResource.addResource('callback')
    slackOAuthCallbackResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.slackOAuthLambda, {
        proxy: true,
      }),
    )

    // Output the API endpoint URLs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'Base URL for PR Notify API',
    })

    new cdk.CfnOutput(this, 'GitHubWebhookUrl', {
      value: `${this.api.url}webhooks/github`,
      description: 'URL to configure in GitHub App webhook settings',
    })

    new cdk.CfnOutput(this, 'SlackCommandsUrl', {
      value: `${this.api.url}slack/commands`,
      description: 'URL to configure in Slack App slash command settings',
    })

    new cdk.CfnOutput(this, 'SlackEventsUrl', {
      value: `${this.api.url}slack/events`,
      description: 'URL to configure in Slack App Event Subscriptions',
    })

    new cdk.CfnOutput(this, 'SlackOAuthAuthorizeUrl', {
      value: `${this.api.url}slack/oauth/authorize`,
      description: 'URL for "Add to Slack" button',
    })

    new cdk.CfnOutput(this, 'SlackOAuthCallbackUrl', {
      value: `${this.api.url}slack/oauth/callback`,
      description: 'URL to configure as OAuth Redirect URL in Slack App',
    })

    // GitHub OAuth callback for verified account linking
    const githubResource = this.api.root.addResource('github')
    const githubOAuthResource = githubResource.addResource('oauth')
    const githubOAuthCallbackResource = githubOAuthResource.addResource('callback')
    githubOAuthCallbackResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(props.githubOAuthLambda, {
        proxy: true,
      }),
    )

    new cdk.CfnOutput(this, 'GitHubOAuthCallbackUrl', {
      value: `${this.api.url}github/oauth/callback`,
      description: 'URL to configure as Callback URL in GitHub App settings',
    })
  }
}
