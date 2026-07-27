import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;
  private readonly fromAddress: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ||
      'Vmito <onboarding@resend.dev>';

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend mail client configured');
    } else {
      this.logger.warn(
        'RESEND_API_KEY not configured. Email notifications will be skipped.'
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

    if (!this.resend || !adminEmail) {
      this.logger.warn(
        'Skipping feedback email: Resend or ADMIN_EMAIL not configured'
      );
      return;
    }

    const typeLabel = feedback.type === 'BUG_REPORT' ? 'Bug Report' : 'Contact';

    try {
      await this.resend.emails.send({
        from: this.fromAddress,
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

  async sendPasswordResetEmail(params: {
    to: string;
    resetUrl: string;
    locale?: string;
    expiresInMinutes: number;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn('Skipping password reset email: Resend not configured');
      return;
    }

    const messages = {
      vi: {
        subject: 'Đặt lại mật khẩu Vmito',
        title: 'Đặt lại mật khẩu',
        intro:
          'Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Vmito. Nhấn nút bên dưới để tạo mật khẩu mới.',
        button: 'Đặt lại mật khẩu',
        note: `Liên kết này sẽ hết hạn sau ${params.expiresInMinutes} phút. Nếu bạn không yêu cầu, vui lòng bỏ qua email này.`,
      },
      en: {
        subject: 'Reset your Vmito password',
        title: 'Reset your password',
        intro:
          'You requested a password reset for your Vmito account. Use the button below to create a new password.',
        button: 'Reset password',
        note: `This link expires in ${params.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`,
      },
      cn: {
        subject: '重置您的 Vmito 密码',
        title: '重置密码',
        intro: '您请求重置 Vmito 账户密码。请点击下方按钮创建新密码。',
        button: '重置密码',
        note: `此链接将在 ${params.expiresInMinutes} 分钟后过期。如果这不是您本人操作，请忽略此邮件。`,
      },
    } as const;

    const locale =
      params.locale && params.locale in messages ? params.locale : 'en';
    const copy = messages[locale as keyof typeof messages];

    try {
      await this.resend.emails.send({
        from: this.fromAddress,
        to: params.to,
        subject: copy.subject,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
            <h2>${copy.title}</h2>
            <p>${copy.intro}</p>
            <p>
              <a href="${params.resetUrl}" style="display: inline-block; padding: 12px 18px; background: #16a34a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 700;">
                ${copy.button}
              </a>
            </p>
            <p>${copy.note}</p>
            <p style="word-break: break-all; color: #4b5563;">${params.resetUrl}</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${params.to}`);
    } catch (error) {
      this.logger.error('Failed to send password reset email', error);
      throw error;
    }
  }
}
