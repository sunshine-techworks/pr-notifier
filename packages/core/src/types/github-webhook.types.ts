/**
 * GitHub webhook event types we handle
 */
export type GitHubWebhookEvent =
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'issue_comment'
  | 'check_run'

/**
 * Common GitHub user structure
 */
export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
  type: 'User' | 'Bot' | 'Organization'
}

/**
 * GitHub repository structure
 */
export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  html_url: string
  owner: GitHubUser
}

/**
 * GitHub pull request structure (minimal fields we need)
 */
export interface GitHubPullRequest {
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  draft: boolean
  user: GitHubUser
  head: {
    ref: string
    sha: string
  }
  base: {
    ref: string
    sha: string
  }
  body: string | null
}

/**
 * GitHub review structure
 */
export interface GitHubReview {
  id: number
  user: GitHubUser
  body: string | null
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending'
  html_url: string
  submitted_at: string
}

/**
 * GitHub comment structure
 */
export interface GitHubComment {
  id: number
  user: GitHubUser
  body: string
  html_url: string
  created_at: string
  updated_at: string
}

/**
 * Pull request event payload
 */
export interface PullRequestEvent {
  action: 'opened' | 'edited' | 'closed' | 'reopened' | 'review_requested' | 'assigned'
  pull_request: GitHubPullRequest
  repository: GitHubRepository
  sender: GitHubUser
  requested_reviewer?: GitHubUser
  changes?: {
    body?: {
      from: string
    }
  }
}

/**
 * Pull request review event payload
 */
export interface PullRequestReviewEvent {
  action: 'submitted' | 'edited' | 'dismissed'
  review: GitHubReview
  pull_request: GitHubPullRequest
  repository: GitHubRepository
  sender: GitHubUser
}

/**
 * Pull request review comment event payload
 */
export interface PullRequestReviewCommentEvent {
  action: 'created' | 'edited' | 'deleted'
  comment: GitHubComment
  pull_request: GitHubPullRequest
  repository: GitHubRepository
  sender: GitHubUser
  changes?: {
    body?: {
      from: string
    }
  }
}

/**
 * Issue comment event payload (used for PR comments)
 */
export interface IssueCommentEvent {
  action: 'created' | 'edited' | 'deleted'
  comment: GitHubComment
  issue: {
    number: number
    title: string
    html_url: string
    user: GitHubUser
    pull_request?: {
      url: string
    }
  }
  repository: GitHubRepository
  sender: GitHubUser
  changes?: {
    body?: {
      from: string
    }
  }
}

/**
 * Check run event payload
 */
export interface CheckRunEvent {
  action: 'created' | 'completed' | 'rerequested'
  check_run: {
    id: number
    name: string
    status: 'queued' | 'in_progress' | 'completed'
    conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null
    html_url: string
    pull_requests: Array<{
      number: number
      head: { ref: string; sha: string }
      base: { ref: string; sha: string }
    }>
  }
  repository: GitHubRepository
  sender: GitHubUser
}

/**
 * Union type of all webhook payloads
 */
export type GitHubWebhookPayload =
  | PullRequestEvent
  | PullRequestReviewEvent
  | PullRequestReviewCommentEvent
  | IssueCommentEvent
  | CheckRunEvent