import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { getApps, cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { DeliveryError } from './provider-error';

export interface EmailInput { to: string | null; subject: string | null; body: string }
export interface PushInput { tokens: string[]; title: string; body: string }

let transporter: Transporter | undefined;
let firebaseApp: App | undefined;

function smtpTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: Number(process.env.SMTP_PORT) === 465, auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  }
  return transporter;
}

function fcmApp(): App {
  if (firebaseApp) return firebaseApp;
  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new DeliveryError('PERMANENT_FAILURE', 'FCM credentials are not configured.', false);
  firebaseApp = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return firebaseApp;
}

export async function sendEmail(input: EmailInput): Promise<{ providerMessageId: string }> {
  if (!input.to) throw new DeliveryError('INVALID_RECIPIENT', 'Recipient email is missing.', false);
  if (process.env.EMAIL_PROVIDER !== 'smtp') {
    console.info(JSON.stringify({ type: 'email', to: input.to, subject: input.subject, body: input.body }));
    return { providerMessageId: `console-email-${randomUUID()}` };
  }
  try {
    const response = await smtpTransport().sendMail({ from: process.env.SMTP_FROM, to: input.to, subject: input.subject ?? '', text: input.body, html: input.body });
    return { providerMessageId: response.messageId };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'EENVELOPE') throw new DeliveryError('INVALID_RECIPIENT', 'The email recipient was rejected.', false);
    throw new DeliveryError('TEMPORARY_FAILURE', 'SMTP provider is unavailable.', true);
  }
}

export async function sendPush(input: PushInput): Promise<{ providerMessageId: string; invalidTokens: string[] }> {
  if (!input.tokens.length) throw new DeliveryError('INVALID_RECIPIENT', 'No active device token is registered for this user.', false);
  if (process.env.PUSH_PROVIDER !== 'fcm') {
    console.info(JSON.stringify({ type: 'push', tokens: input.tokens.length, title: input.title }));
    return { providerMessageId: `console-push-${randomUUID()}`, invalidTokens: [] };
  }
  try {
    const result = await getMessaging(fcmApp()).sendEachForMulticast({ tokens: input.tokens, notification: { title: input.title, body: input.body } });
    const invalidTokens = result.responses.flatMap((response, index) => response.success ? [] : ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error?.code ?? '') ? [input.tokens[index]] : []);
    if (result.successCount === 0 && invalidTokens.length === input.tokens.length) throw new DeliveryError('INVALID_RECIPIENT', 'All registered push tokens are invalid.', false);
    if (result.successCount === 0) throw new DeliveryError('TEMPORARY_FAILURE', 'FCM did not accept the message.', true);
    const providerMessageId = result.responses.find((response) => response.success)?.messageId ?? `fcm-${randomUUID()}`;
    return { providerMessageId, invalidTokens };
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('PROVIDER_ERROR', 'FCM provider error.', true);
  }
}
