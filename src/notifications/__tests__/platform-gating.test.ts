/**
 * Tests for platform activation gating in getEnabledPlatforms.
 *
 * Covers:
 * - Telegram requires OMAC_TELEGRAM=1 to be included
 * - Discord and discord-bot require OMAC_DISCORD=1 to be included
 * - Slack requires OMAC_SLACK=1 to be included
 * - Webhook requires OMAC_WEBHOOK=1 to be included
 * - Combined env vars enable all platforms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEnabledPlatforms } from '../config.js';
import type { NotificationConfig } from '../types.js';

/**
 * A full notification config with all platforms enabled.
 * Used as the base for gating tests.
 */
function makeFullConfig(): NotificationConfig {
  return {
    enabled: true,
    telegram: {
      enabled: true,
      botToken: 'test-bot-token',
      chatId: 'test-chat-id',
    },
    discord: {
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/test',
    },
    'discord-bot': {
      enabled: true,
      botToken: 'test-discord-bot-token',
      channelId: 'test-channel-id',
    },
    slack: {
      enabled: true,
      webhookUrl: 'https://hooks.slack.com/services/test',
    },
    webhook: {
      enabled: true,
      url: 'https://example.com/webhook',
    },
  };
}

describe('platform gating via getEnabledPlatforms', () => {
  beforeEach(() => {
    // Clear all platform gate env vars before each test
    vi.stubEnv('OMAC_TELEGRAM', '');
    vi.stubEnv('OMAC_DISCORD', '');
    vi.stubEnv('OMAC_SLACK', '');
    vi.stubEnv('OMAC_WEBHOOK', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ---------------------------------------------------------------------------
  // Telegram gating
  // ---------------------------------------------------------------------------

  it('excludes telegram when OMAC_TELEGRAM is not set', () => {
    vi.stubEnv('OMAC_TELEGRAM', '');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).not.toContain('telegram');
  });

  it('includes telegram when OMAC_TELEGRAM=1', () => {
    vi.stubEnv('OMAC_TELEGRAM', '1');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).toContain('telegram');
  });

  // ---------------------------------------------------------------------------
  // Discord gating
  // ---------------------------------------------------------------------------

  it('excludes discord when OMAC_DISCORD is not set', () => {
    vi.stubEnv('OMAC_DISCORD', '');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).not.toContain('discord');
  });

  it('excludes discord-bot when OMAC_DISCORD is not set', () => {
    vi.stubEnv('OMAC_DISCORD', '');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).not.toContain('discord-bot');
  });

  it('includes discord when OMAC_DISCORD=1', () => {
    vi.stubEnv('OMAC_DISCORD', '1');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).toContain('discord');
  });

  it('includes discord-bot when OMAC_DISCORD=1', () => {
    vi.stubEnv('OMAC_DISCORD', '1');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).toContain('discord-bot');
  });

  // ---------------------------------------------------------------------------
  // Slack gating
  // ---------------------------------------------------------------------------

  it('excludes slack when OMAC_SLACK is not set', () => {
    vi.stubEnv('OMAC_SLACK', '');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).not.toContain('slack');
  });

  it('includes slack when OMAC_SLACK=1', () => {
    vi.stubEnv('OMAC_SLACK', '1');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).toContain('slack');
  });

  // ---------------------------------------------------------------------------
  // Webhook gating
  // ---------------------------------------------------------------------------

  it('excludes webhook when OMAC_WEBHOOK is not set', () => {
    vi.stubEnv('OMAC_WEBHOOK', '');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).not.toContain('webhook');
  });

  it('includes webhook when OMAC_WEBHOOK=1', () => {
    vi.stubEnv('OMAC_WEBHOOK', '1');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).toContain('webhook');
  });

  // ---------------------------------------------------------------------------
  // No platforms when no env vars set
  // ---------------------------------------------------------------------------

  it('returns empty array when no platform env vars are set', () => {
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Combined: all gates open
  // ---------------------------------------------------------------------------

  it('includes all platforms when all env vars are set', () => {
    vi.stubEnv('OMAC_TELEGRAM', '1');
    vi.stubEnv('OMAC_DISCORD', '1');
    vi.stubEnv('OMAC_SLACK', '1');
    vi.stubEnv('OMAC_WEBHOOK', '1');
    const platforms = getEnabledPlatforms(makeFullConfig(), 'session-end');
    expect(platforms).toContain('telegram');
    expect(platforms).toContain('discord');
    expect(platforms).toContain('discord-bot');
    expect(platforms).toContain('slack');
    expect(platforms).toContain('webhook');
  });
});
