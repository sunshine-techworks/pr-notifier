/**
 * Set of known bot usernames (lowercase)
 * This list can be extended as needed
 */
export const KNOWN_BOTS = new Set([
  // GitHub native bots
  'github-actions[bot]',
  'dependabot[bot]',
  'dependabot-preview[bot]',
  'github-pages[bot]',

  // Popular CI/CD bots
  'renovate[bot]',
  'renovate-bot',
  'greenkeeper[bot]',
  'snyk-bot',

  // Code quality bots
  'codecov[bot]',
  'codecov-io',
  'coveralls',
  'codeclimate[bot]',
  'sonarcloud[bot]',

  // Security bots
  'mend-bolt-for-github[bot]',
  'whitesource-bolt-for-github[bot]',

  // Documentation bots
  'allcontributors[bot]',
  'all-contributors[bot]',

  // Release bots
  'semantic-release-bot',
  'release-drafter[bot]',

  // AI assistants
  'copilot[bot]',
  'github-copilot[bot]',
  'coderabbitai[bot]',

  // Merge bots
  'mergify[bot]',
  'kodiakhq[bot]',

  // Other common bots
  'stale[bot]',
  'lock[bot]',
  'probot[bot]',
  'imgbot[bot]',
  'netlify[bot]',
  'vercel[bot]',
])
