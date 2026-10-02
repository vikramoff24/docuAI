import { Throttle } from '@nestjs/throttler';

const MINUTE = 60_000;

/**
 * Global limits per client IP, applied to every route.
 * `short` absorbs bursts; `sustained` caps steady traffic (the dashboard polls
 * every 2s while documents process or workflows run, ~30 req/min per tab).
 */
export const GLOBAL_THROTTLERS = [
  { name: 'short', ttl: 1_000, limit: 20 },
  { name: 'sustained', ttl: MINUTE, limit: 300 },
];

/**
 * Stricter per-route limits (per client IP). A route with one of these gets its
 * own `sustained` bucket instead of sharing the global one.
 */
export const ROUTE_LIMITS = {
  /** Password guessing */
  login: { limit: 10, ttl: MINUTE },
  /** Account/organization creation spam */
  register: { limit: 10, ttl: 10 * MINUTE },
  /** Several tabs refresh independently; still bounded */
  refresh: { limit: 30, ttl: MINUTE },
  /** Public: invitation token probing */
  invitationPreview: { limit: 20, ttl: MINUTE },
  invitationAccept: { limit: 10, ttl: MINUTE },
  /** Calls the AI provider on the organization's key (cost) */
  aiChat: { limit: 20, ttl: MINUTE },
  aiSummarize: { limit: 10, ttl: MINUTE },
  aiWorkflow: { limit: 10, ttl: MINUTE },
  aiKeyVerify: { limit: 5, ttl: MINUTE },
  reindex: { limit: 3, ttl: MINUTE },
} as const;

/** Applies a stricter per-route limit from ROUTE_LIMITS. */
export const RateLimit = (name: keyof typeof ROUTE_LIMITS) =>
  Throttle({ sustained: ROUTE_LIMITS[name] });
