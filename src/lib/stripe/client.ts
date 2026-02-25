import Stripe from "stripe";
import { loadStripe } from "@stripe/stripe-js";

let stripeServerClient: Stripe | null = null;

export function getStripeServerClient(): Stripe {
  if (!stripeServerClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
    }
    stripeServerClient = new Stripe(secretKey, {
      typescript: true,
    });
  }
  return stripeServerClient;
}

let stripePromise: ReturnType<typeof loadStripe> | null = null;

export function getStripeBrowserClient() {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error(
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set in environment variables"
      );
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}
