import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import { HandlerError, type EventHandler } from "@/workers/event-handlers/base";

type RegistrationCreatedPayload = {
  registrationId: string;
  attendeeId: string;
  attendeeEmail: string;
  attendeeName: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  eventDate: string;
  eventTime: string;
};

export class RegistrationCreatedHandler implements EventHandler {
  readonly eventType = "REGISTRATION_CREATED";

  async handle(event: OutboxEvent): Promise<void> {
    try {
      const payload = event.payload as RegistrationCreatedPayload;

      console.log(`[Handler] Processing REGISTRATION_CREATED for registration ${payload.registrationId}`);

      // Placeholder: In production, this would:
      // - Send confirmation email to attendee
      // - Send notification to event host
      // - Trigger downstream analytics/CRM
      // - etc.

      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log(`[Handler] REGISTRATION_CREATED processed for registration ${payload.registrationId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Handler] REGISTRATION_CREATED failed: ${errorMessage}`);
      throw new HandlerError(errorMessage, event._id.toString(), this.eventType);
    }
  }
}

export const registrationCreatedHandler = new RegistrationCreatedHandler();
