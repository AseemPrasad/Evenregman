import "server-only";

import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { connectToDatabase } from "@/lib/db";
import { OrganizationModel } from "@/models/Organization";

export async function POST(req: Request) {
  const stripe = getStripeClient();

  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: any;

  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Signature verification failed:`, err?.message);
    return NextResponse.json({ error: `Webhook Error: ${err?.message}` }, { status: 400 });
  }

  try {
    await connectToDatabase();

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;
        const status = subscription.status;

        console.log(`[Stripe Webhook] Subscription update: customer=${customerId}, status=${status}`);

        // Update organization subscription status
        await OrganizationModel.updateOne(
          { stripeCustomerId: customerId },
          {
            $set: {
              subscriptionStatus: status,
              updatedAt: new Date()
            }
          }
        );
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        console.log(`[Stripe Webhook] Payment succeeded for invoice ${invoice.id}, amount: ${invoice.amount_paid}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        console.warn(`[Stripe Webhook] Payment failed for invoice ${invoice.id}`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (dbErr: any) {
    console.error(`[Stripe Webhook] Error processing event ${event.type}:`, dbErr);
    return NextResponse.json({ error: "Internal processing error" }, { status: 500 });
  }
}

