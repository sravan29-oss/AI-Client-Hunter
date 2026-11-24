import nodemailer, { type Transporter } from 'nodemailer';
import axios from 'axios';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface NotificationPayload {
  leadId?: string;
  title: string;
  message: string;
  type?: 'LEAD_QUALIFIED' | 'LEAD_DISCOVERED' | 'SEARCH_COMPLETED' | 'PROVIDER_ERROR' | 'SYSTEM';
  metadata?: any;
}

export interface SendAlertOptions {
  inApp?: boolean;
  email?: boolean;
  telegram?: boolean;
  customEmail?: string;
  customTelegramChatId?: string;
}

export type DeliveryChannel = 'EMAIL' | 'TELEGRAM';
export type DeliveryOutcome = { status: 'DELIVERED' } | { status: 'RETRYING' | 'FAILED'; reason: string };

interface LeadAlert {
  id?: string;
  businessName: string;
  website?: string | null;
  country?: string | null;
  city?: string | null;
  source?: string | null;
  opportunityScore?: number;
  suggestedServices?: string[];
  qualificationReason?: string | null;
  mainOpportunity?: string;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export class NotificationService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initSmtpTransporter();
  }

  private initSmtpTransporter() {
    if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
      try {
        this.transporter = nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_PORT === 465,
          requireTLS: config.NODE_ENV === 'production' && config.SMTP_PORT !== 465,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          auth: {
            user: config.SMTP_USER,
            pass: config.SMTP_PASS,
          },
        });
        logger.info('SMTP transport configured.');
      } catch (err: any) {
        logger.error('SMTP transport initialization failed.');
        this.transporter = null;
      }
    } else {
      this.transporter = null;
    }
  }

  /**
   * Create an in-app notification record in PostgreSQL or memoryStore fallback.
   */
  async createInAppNotification(data: NotificationPayload) {
    try {
      if (isDatabaseConnected) {
        return await prisma.notification.create({
          data: {
            leadId: data.leadId || null,
            title: data.title,
            message: data.message,
            type: data.type || 'LEAD_QUALIFIED',
            metadata: data.metadata || null,
          },
        });
      }

      const item = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        leadId: data.leadId || null,
        title: data.title,
        message: data.message,
        type: data.type || 'LEAD_QUALIFIED',
        read: false,
        metadata: data.metadata || null,
        createdAt: new Date(),
      };
      memoryStore.notifications.unshift(item);
      return item;
    } catch (err: any) {
      logger.error('Failed to create in-app notification.');
      return null;
    }
  }

  /**
   * Send email notification to user via configured SMTP.
   * Gracefully skips if SMTP credentials are not configured.
   */
  async sendEmailNotification(to: string, subject: string, htmlContent: string): Promise<boolean> {
    return (await this.deliverEmail(to || config.NOTIFICATION_EMAIL, subject, htmlContent)).status === 'DELIVERED';
  }

  private async deliverEmail(recipient: string, subject: string, html: string, deliveryId?: string): Promise<DeliveryOutcome> {
    if (!recipient || !this.transporter) return { status: 'FAILED', reason: 'Email delivery is not configured.' };
    try {
      const result = await this.transporter.sendMail({
        from: config.SMTP_FROM || config.SMTP_USER, to: recipient, subject, html,
        messageId: deliveryId ? `<${deliveryId}@ai-client-hunter.local>` : undefined,
      });
      return result.accepted?.length ? { status: 'DELIVERED' } : { status: 'FAILED', reason: 'SMTP did not accept the recipient.' };
    } catch (error) {
      const failure = error as { responseCode?: number; code?: string; command?: string };
      const response = failure.responseCode ?? 0;
      if ((response >= 400 && response < 500) || failure.command === 'CONN') {
        return { status: 'RETRYING', reason: 'SMTP temporarily rejected the delivery or the connection failed before sending.' };
      }
      if (response >= 500 || failure.code === 'EAUTH') return { status: 'FAILED', reason: 'SMTP permanently rejected the delivery.' };
      return { status: 'FAILED', reason: 'SMTP delivery was not confirmed. Review before resending.' };
    }
  }

  async sendTelegramNotification(message: string, customChatId?: string): Promise<boolean> {
    return (await this.deliverTelegram(customChatId || config.TELEGRAM_CHAT_ID, message)).status === 'DELIVERED';
  }

  private async deliverTelegram(chatId: string, message: string): Promise<DeliveryOutcome> {
    const token = config.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId) return { status: 'FAILED', reason: 'Telegram delivery is not configured.' };
    try {
      const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true,
      }, { timeout: 8000, maxRedirects: 0, maxContentLength: 65536 });
      return response.data?.ok === true ? { status: 'DELIVERED' } : { status: 'FAILED', reason: 'Telegram did not confirm delivery.' };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 429 || (status && status >= 500 && error.response?.data?.ok === false)
          || ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error.code || '')) {
          return { status: 'RETRYING', reason: 'Telegram temporarily rejected the delivery or the connection failed before sending.' };
        }
        if (status && status >= 400 && status < 500) return { status: 'FAILED', reason: 'Telegram rejected the delivery.' };
      }
      return { status: 'FAILED', reason: 'Telegram delivery was not confirmed. Review before resending.' };
    }
  }

  /**
   * Dispatch lead alert to all configured channels (In-App, Email, Telegram).
   */
  describeLeadAlert(lead: LeadAlert) {
    const score = lead.opportunityScore ?? 0;
    const location = [lead.city, lead.country].filter(Boolean).join(', ') || 'Location unavailable';
    const service = lead.suggestedServices?.[0] || 'Website development';
    return {
      leadId: lead.id,
      title: `Qualified lead: ${lead.businessName} (${score}/100)`,
      message: [location, lead.mainOpportunity || service, lead.source || 'Directory source'].join(' · '),
      type: 'LEAD_QUALIFIED' as const,
      metadata: { opportunityScore: score, suggestedService: service, website: lead.website || null, source: lead.source || null },
    };
  }

  private formatDelivery(lead: LeadAlert) {
    const alert = this.describeLeadAlert(lead);
    const url = config.APP_PUBLIC_URL && lead.id ? new URL(config.APP_PUBLIC_URL) : null;
    if (url && lead.id) url.searchParams.set('lead', lead.id);
    const summary = [alert.message, lead.website ? `Website: ${lead.website}` : 'Website unavailable in the source', lead.qualificationReason]
      .filter((line): line is string => Boolean(line)).map((line) => escapeHtml(line.slice(0, 650)));
    const link = url ? `<a href="${escapeHtml(url.toString())}">Open lead in CRM</a>` : '';
    const title = escapeHtml(alert.title.slice(0, 360));
    return {
      subject: '[AI Client Hunter] ' + alert.title.slice(0, 180),
      html: [`<h2>${title}</h2>`, ...summary.map((line) => `<p>${line}</p>`), link].join('\n'),
      text: [`<b>${title}</b>`, ...summary, link].filter(Boolean).join('\n\n'),
    };
  }

  async deliverLeadAlert(channel: DeliveryChannel, lead: LeadAlert, recipient: string, id: string): Promise<DeliveryOutcome> {
    const content = this.formatDelivery(lead);
    return channel === 'EMAIL'
      ? this.deliverEmail(recipient, content.subject, content.html, id)
      : this.deliverTelegram(recipient, content.text);
  }

  async sendLeadAlert(lead: LeadAlert, options: SendAlertOptions = { inApp: true }) {
    const alert = this.describeLeadAlert(lead);
    const inAppResult = options.inApp === false ? null : await this.createInAppNotification(alert);
    if (options.email || options.telegram) {
      const content = this.formatDelivery(lead);
      if (options.email) await this.sendEmailNotification(options.customEmail || '', content.subject, content.html);
      if (options.telegram) await this.sendTelegramNotification(content.text, options.customTelegramChatId);
    }
    return inAppResult;
  }

  /**
   * Fetch paginated notifications.
   */
  async getNotifications(limit = 50, offset = 0, unreadOnly = false) {
    if (isDatabaseConnected) {
      const where = unreadOnly ? { read: false } : undefined;
      const [items, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            lead: {
              select: {
                id: true,
                businessName: true,
                website: true,
                opportunityScore: true,
                leadStatus: true,
              },
            },
          },
        }),
        prisma.notification.count({ where }),
      ]);
      return { items, total };
    }

    let filtered = memoryStore.notifications;
    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.read);
    }
    const items = filtered.slice(offset, offset + limit);
    return { items, total: filtered.length };
  }

  /**
   * Get unread notifications count.
   */
  async getUnreadCount(): Promise<number> {
    if (isDatabaseConnected) {
      return await prisma.notification.count({ where: { read: false } });
    }
    return memoryStore.notifications.filter((n) => !n.read).length;
  }

  /**
   * Mark single notification as read.
   */
  async markAsRead(id: string) {
    if (isDatabaseConnected) {
      return await prisma.notification.update({
        where: { id },
        data: { read: true },
      });
    }
    const target = memoryStore.notifications.find((n) => n.id === id);
    if (target) {
      target.read = true;
    }
    return target;
  }

  /**
   * Mark all notifications as read.
   */
  async markAllAsRead() {
    if (isDatabaseConnected) {
      return await prisma.notification.updateMany({
        where: { read: false },
        data: { read: true },
      });
    }
    memoryStore.notifications.forEach((n) => (n.read = true));
    return { count: memoryStore.notifications.length };
  }

  /**
   * Delete a notification.
   */
  async deleteNotification(id: string) {
    if (isDatabaseConnected) {
      return await prisma.notification.delete({
        where: { id },
      });
    }
    const index = memoryStore.notifications.findIndex((n) => n.id === id);
    if (index !== -1) {
      return memoryStore.notifications.splice(index, 1)[0];
    }
    return null;
  }
}

export const notificationService = new NotificationService();
