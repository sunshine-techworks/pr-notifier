import { describe, expect, it } from 'vitest'

import { createTestUser } from '../testing/index'
import type { SlackActionsBlock, SlackBlock, SlackCheckboxElement, SlackOption, SlackSectionBlock } from '../types/index'

import { buildAppHomeBlocks } from './app-home-builder'

/** Helper to find the checkbox element within the blocks */
function findCheckboxElement(blocks: SlackBlock[]): SlackCheckboxElement | undefined {
  for (const block of blocks) {
    if (block.type === 'actions') {
      const actionsBlock = block
      for (const element of actionsBlock.elements) {
        if (element.type === 'checkboxes') {
          return element
        }
      }
    }
  }
  return undefined
}

/** Helper to find a button by action_id */
function findButton(blocks: SlackBlock[], actionId: string) {
  for (const block of blocks) {
    if (block.type === 'actions') {
      for (const element of block.elements) {
        if (element.type === 'button' && element.action_id === actionId) {
          return element
        }
      }
    }
  }
  return undefined
}

/** Extract the values from an options array */
function optionValues(options: SlackOption[]): string[] {
  return options.map(opt => opt.value)
}

describe('buildAppHomeBlocks', () => {
  describe('linked user', () => {
    it('returns header with "PR Notify Settings"', () => {
      const blocks = buildAppHomeBlocks(createTestUser())
      const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
      expect(header?.text.text).toBe('PR Notify Settings')
    })

    it('displays linked GitHub username', () => {
      const blocks = buildAppHomeBlocks(createTestUser({ githubUsername: 'octocat' }))
      const sections = blocks.filter((b): b is SlackSectionBlock => b.type === 'section')
      const linkedSection = sections.find(s => s.text?.text?.includes('octocat'))
      expect(linkedSection).toBeDefined()
    })

    it('includes all 6 preference options in checkbox group', () => {
      const checkbox = findCheckboxElement(buildAppHomeBlocks(createTestUser()))
      expect(checkbox).toBeDefined()
      expect(checkbox?.options).toHaveLength(6)

      const values = optionValues(checkbox?.options ?? [])
      expect(values).toContain('reviewRequests')
      expect(values).toContain('reviewsOnMyPrs')
      expect(values).toContain('commentsFromHumans')
      expect(values).toContain('commentsFromBots')
      expect(values).toContain('mentions')
      expect(values).toContain('ciFailures')
    })

    it('sets correct initial_options based on enabled preferences', () => {
      const user = createTestUser({
        preferences: {
          reviewRequests: true,
          reviewsOnMyPrs: false,
          commentsFromHumans: true,
          commentsFromBots: false,
          mentions: false,
          ciFailures: true,
        },
      })
      const checkbox = findCheckboxElement(buildAppHomeBlocks(user))
      const selectedValues = optionValues(checkbox?.initial_options ?? [])

      expect(selectedValues).toContain('reviewRequests')
      expect(selectedValues).toContain('commentsFromHumans')
      expect(selectedValues).toContain('ciFailures')
      expect(selectedValues).not.toContain('reviewsOnMyPrs')
      expect(selectedValues).not.toContain('commentsFromBots')
      expect(selectedValues).not.toContain('mentions')
    })

    it('includes all 6 in initial_options when all preferences are ON', () => {
      const user = createTestUser({
        preferences: {
          reviewRequests: true,
          reviewsOnMyPrs: true,
          commentsFromHumans: true,
          commentsFromBots: true,
          mentions: true,
          ciFailures: true,
        },
      })
      const checkbox = findCheckboxElement(buildAppHomeBlocks(user))
      expect(checkbox?.initial_options).toHaveLength(6)
    })

    it('omits initial_options when all preferences are OFF', () => {
      const user = createTestUser({
        preferences: {
          reviewRequests: false,
          reviewsOnMyPrs: false,
          commentsFromHumans: false,
          commentsFromBots: false,
          mentions: false,
          ciFailures: false,
        },
      })
      const checkbox = findCheckboxElement(buildAppHomeBlocks(user))
      // initial_options should not be set at all (satisfies exactOptionalPropertyTypes)
      expect(checkbox?.initial_options).toBeUndefined()
    })

    it('uses notification_preferences as checkbox action_id', () => {
      const checkbox = findCheckboxElement(buildAppHomeBlocks(createTestUser()))
      expect(checkbox?.action_id).toBe('notification_preferences')
    })

    it('includes unlink_account button with danger style', () => {
      const button = findButton(buildAppHomeBlocks(createTestUser()), 'unlink_account')
      expect(button).toBeDefined()
      expect(button?.style).toBe('danger')
      expect(button?.text.text).toBe('Unlink Account')
    })

    it('includes dividers between sections', () => {
      const blocks = buildAppHomeBlocks(createTestUser())
      const dividers = blocks.filter(b => b.type === 'divider')
      expect(dividers.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('unlinked user', () => {
    it('returns header with "PR Notify Settings"', () => {
      const blocks = buildAppHomeBlocks(null)
      const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
      expect(header?.text.text).toBe('PR Notify Settings')
    })

    it('shows prompt to link GitHub account', () => {
      const blocks = buildAppHomeBlocks(null)
      const sections = blocks.filter((b): b is SlackSectionBlock => b.type === 'section')
      const linkPrompt = sections.find(s => s.text?.text?.includes('linked'))
      expect(linkPrompt).toBeDefined()
    })

    it('shows link command usage hint', () => {
      const blocks = buildAppHomeBlocks(null)
      const sections = blocks.filter((b): b is SlackSectionBlock => b.type === 'section')
      const usageHint = sections.find(s => s.text?.text?.includes('/pr-notify link'))
      expect(usageHint).toBeDefined()
    })

    it('does not include checkbox group', () => {
      const checkbox = findCheckboxElement(buildAppHomeBlocks(null))
      expect(checkbox).toBeUndefined()
    })

    it('does not include unlink button', () => {
      const button = findButton(buildAppHomeBlocks(null), 'unlink_account')
      expect(button).toBeUndefined()
    })
  })
})
