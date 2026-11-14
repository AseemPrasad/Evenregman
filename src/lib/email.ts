import "server-only";

import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  if (env.ENABLE_EMAIL_DISPATCH !== "true" || !env.EMAIL_SERVER_HOST) {
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_SERVER_HOST,
      port: parseInt(env.EMAIL_SERVER_PORT, 10),
      secure: parseInt(env.EMAIL_SERVER_PORT, 10) === 465,
      auth: env.EMAIL_SERVER_USER
        ? {
            user: env.EMAIL_SERVER_USER,
            pass: env.EMAIL_SERVER_PASSWORD
          }
        : undefined
    });
    return transporter;
  } catch (err) {
    console.error("[Email] Failed to create SMTP transporter:", err);
    return null;
  }
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const mailer = getTransporter();

  if (!mailer) {
    console.log(
      `[Email] Delivery skipped (ENABLE_EMAIL_DISPATCH=false or missing SMTP config). To: ${options.to}, Subject: "${options.subject}"`
    );
    return true; // Graceful non-blocking fallback
  }

  try {
    await mailer.sendMail({
      from: env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]+>/g, "")
    });
    console.log(`[Email] Successfully delivered email to ${options.to}: "${options.subject}"`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send email to ${options.to}:`, err);
    return false;
  }
}

export function buildBookingConfirmationHtml(data: {
  attendeeName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  registrationId: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">Reservation Confirmed!</h2>
      <p style="color: #334155;">Hello ${data.attendeeName},</p>
      <p style="color: #334155;">Your registration for <strong>${data.eventTitle}</strong> is confirmed.</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>Date:</strong> ${data.eventDate}</p>
        <p style="margin: 0 0 8px 0; color: #1e293b;"><strong>Time:</strong> ${data.eventTime}</p>
        <p style="margin: 0; color: #64748b; font-size: 13px;"><strong>Ticket / Registration ID:</strong> ${data.registrationId}</p>
      </div>
      <p style="color: #64748b; font-size: 14px;">If you need to manage or cancel your registration, visit your dashboard at any time.</p>
    </div>
  `;
}

export function buildCancellationHtml(data: {
  attendeeName: string;
  eventTitle: string;
  registrationId: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">Registration Cancelled</h2>
      <p style="color: #334155;">Hello ${data.attendeeName},</p>
      <p style="color: #334155;">Your registration for <strong>${data.eventTitle}</strong> (ID: <code>${data.registrationId}</code>) has been successfully cancelled and your seat released.</p>
      <p style="color: #64748b; font-size: 14px;">We hope to see you at another event soon.</p>
    </div>
  `;
}

