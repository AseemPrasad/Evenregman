import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import { HandlerError, type EventHandler } from "@/workers/event-handlers/base";
import { leaseAllocatedHandler } from "@/workers/event-handlers/lease-allocated";
import { sendEmail, buildBookingConfirmationHtml } from "@/lib/email";

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
  eventType?: string;
};

export class RegistrationCreatedHandler implements EventHandler {
  readonly eventType = "REGISTRATION_CREATED";

  async handle(event: OutboxEvent): Promise<void> {
    try {
      const payload = event.payload as RegistrationCreatedPayload;

      // Defensive check: If payload represents a ResMesh lease allocation, delegate to leaseAllocatedHandler
      if (payload?.eventType === "lease.allocated") {
        console.log(`[Handler] Delegating lease allocation event ${event._id} to leaseAllocatedHandler`);
        await leaseAllocatedHandler.handle(event);
        return;
      }

      console.log(`[Handler] Processing REGISTRATION_CREATED for registration ${payload.registrationId}`);

      // Dispatch real transactional confirmation email
      if (payload.attendeeEmail) {
        await sendEmail({
          to: payload.attendeeEmail,
          subject: `Confirmed: ${payload.eventTitle || "Your Registration"}`,
          html: buildBookingConfirmationHtml({
            attendeeName: payload.attendeeName || "Attendee",
            eventTitle: payload.eventTitle || "Event",
            eventDate: payload.eventDate || "Upcoming",
            eventTime: payload.eventTime || "Scheduled",
            registrationId: payload.registrationId
          })
        });
      }

      console.log(`[Handler] REGISTRATION_CREATED processed for registration ${payload.registrationId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Handler] REGISTRATION_CREATED failed: ${errorMessage}`);
      throw new HandlerError(errorMessage, event._id.toString(), this.eventType);
    }
  }
}

export const registrationCreatedHandler = new RegistrationCreatedHandler();
