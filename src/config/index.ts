/**
 * Hollis - App-wide configuration and constants
 */

export const APP_NAME = "Hollis";

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const PLANS = {
  starter: {
    name: "Starter",
    price: 99,
    interval: "month" as const,
    priceId: process.env.STRIPE_STARTER_PRICE_ID,
  },
  pro: {
    name: "Pro",
    price: 199,
    interval: "month" as const,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
  },
} as const;

export type PlanId = keyof typeof PLANS;
