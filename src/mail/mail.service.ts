import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: port || 587,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log('Mail transporter configured');
    } else {
      this.logger.warn(
        'SMTP not configured. Email notifications will be skipped.',
      );
    }
  }

  async sendFeedbackNotification(feedback: {
    type: string;
    title: string;
    description: string;
    userName: string;
    userEmail: string;
  }): Promise<void> {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');

    if (!this.transporter || !adminEmail) {
      this.logger.warn(
        'Skipping feedback email: SMTP or ADMIN_EMAIL not configured',
      );
      return;
    }

    const typeLabel =
      feedback.type === 'BUG_REPORT' ? 'Bug Report' : 'Contact';

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_USER'),
        to: adminEmail,
        subject: `[Vmito ${typeLabel}] ${feedback.title}`,
        html: `
          <h2>New ${typeLabel} from ${feedback.userName}</h2>
          <p><strong>From:</strong> ${feedback.userName} (${feedback.userEmail})</p>
          <p><strong>Title:</strong> ${feedback.title}</p>
          <p><strong>Description:</strong></p>
          <p>${feedback.description.replace(/\n/g, '<br>')}</p>
        `,
      });
      this.logger.log(`Feedback notification email sent to ${adminEmail}`);
    } catch (error) {
      this.logger.error('Failed to send feedback notification email', error);
    }
  }
}
