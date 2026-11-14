import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import { HandlerError, type EventHandler } from "@/workers/event-handlers/base";
import { sendEmail, buildCancellationHtml } from "@/lib/email";

type RegistrationCancelledPayload = {
  registrationId: string;
  attendeeId?: string;
  attendeeEmail?: string;
  attendeeName?: string;
  eventId?: string;
  eventTitle?: string;
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

      if (payload.attendeeEmail) {
        await sendEmail({
          to: payload.attendeeEmail,
          subject: `Cancelled: ${payload.eventTitle || "Your Registration"}`,
          html: buildCancellationHtml({
            attendeeName: payload.attendeeName || "Attendee",
            eventTitle: payload.eventTitle || "Event",
            registrationId: payload.registrationId
          })
        });
      }

      console.log(`[Handler] REGISTRATION_CANCELLED processed for registration ${payload.registrationId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Handler] REGISTRATION_CANCELLED failed: ${errorMessage}`);
      throw new HandlerError(errorMessage, event._id.toString(), this.eventType);
    }
  }
}

export const registrationCancelledHandler = new RegistrationCancelledHandler();
