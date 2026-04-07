/** Broker-approved actions required before leaving learning mode (any intent). */
export const LEARNING_MODE_THRESHOLD = 20;

/**
 * Premium increase at or above this percentage routes to Tier 2 (broker review).
 * Applies to both inbound and outbound routing.
 */
export const PREMIUM_INCREASE_TIER2_PCT = 20;

/**
 * Premium increase above this percentage is a Tier 3 hard stop.
 * Applies to both inbound and outbound routing.
 */
export const PREMIUM_INCREASE_TIER3_PCT = 25;

/** Days after a sent email with no client response before flagging as silent. */
export const SILENT_CLIENT_DAYS = 21;
