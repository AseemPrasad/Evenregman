import "server-only";

import Stripe from "stripe";
import { env } from "@/lib/env";

let stripeInstance: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (stripeInstance) return stripeInstance;

  if (env.ENABLE_STRIPE_BILLING !== "true" || !env.STRIPE_SECRET_KEY) {
    return null;
  }

  stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia" as any
  });

  return stripeInstance;
}

/**
 * Reports a metered usage event to Stripe Billing for ResMesh compute leases or API quotas.
 */
export async function reportStripeMeterEvent(
  eventName: string,
  stripeCustomerId: string,
  value: number,
  timestamp?: number
): Promise<boolean> {
  const stripe = getStripeClient();

  if (!stripe) {
    console.log(`[Stripe] Billing disabled or unconfigured. Simulating meter event: ${eventName} (${value}) for ${stripeCustomerId}`);
    return true;
  }

  try {
    await stripe.billing.meterEvents.create({
      event_name: eventName,
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: value.toString()
      },
      timestamp: timestamp || Math.floor(Date.now() / 1000)
    });
    console.log(`[Stripe] Successfully reported ${value} units for meter ${eventName}`);
    return true;
  } catch (err) {
    console.error(`[Stripe] Failed to report meter event:`, err);
    return false;
  }
}

