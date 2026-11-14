import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import { HandlerError, type EventHandler } from "@/workers/event-handlers/base";

type RegistrationCancelledPayload = {
  registrationId: string;
  attendeeId?: string;
  eventId?: string;
  eventSlug?: string;
  cancelledByHost?: boolean;
  cancelledAt?: string;
};

export class RegistrationCancelledHandler implements EventHandler {
  readonly eventType = "REGISTRATION_CANCELLED";

  async handle(event: OutboxEvent): Promise<void> {
    try {
      const payload = event.payload as RegistrationCancelledPayload;

      console.log(`[Handler] Processing REGISTRATION_CANCELLED for registration ${payload.registrationId}`);

      // Placeholder for downstream actions:
      // - Send cancellation confirmation email
      // - Trigger waitlist promotion
      // - Release external seat reservation
      await new Promise((resolve) => setTimeout(resolve, 50));

      console.log(`[Handler] REGISTRATION_CANCELLED processed for registration ${payload.registrationId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Handler] REGISTRATION_CANCELLED failed: ${errorMessage}`);
      throw new HandlerError(errorMessage, event._id.toString(), this.eventType);
    }
  }
}

export const registrationCancelledHandler = new RegistrationCancelledHandler();

