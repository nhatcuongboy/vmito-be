import { Prisma } from '@prisma/client';
import {
  DEFAULT_PUSH_LOCALE,
  PUSH_LOCALES,
  PUSH_TEMPLATES,
  LocalizedText,
  PushLocale,
} from './push-templates';

export interface LocalizablePush {
  title: string;
  message: string;
  data: Prisma.JsonValue;
}

/**
 * Maps whatever the client reported (`vi`, `en-US`, `zh_CN`, `cn`, ...) to a
 * locale we have copy for. Web uses `cn` for Chinese; the app sends `zh`.
 */
export function normalizePushLocale(raw?: string | null): PushLocale {
  const language = raw?.trim().toLowerCase().split(/[-_]/)[0];
  if (language === 'cn') return 'zh';
  return (
    PUSH_LOCALES.find((locale) => locale === language) ?? DEFAULT_PUSH_LOCALE
  );
}

/**
 * Returns the title/message to put on the wire for [locale]. Notifications
 * without a known `data.action` (e.g. chat, tier-up, free-form broadcasts)
 * keep the text stored when they were created.
 */
export function localizePush(
  notification: LocalizablePush,
  locale: PushLocale
): { title: string; message: string } {
  const data = asRecord(notification.data);
  const action = data?.action;
  const template = typeof action === 'string' ? PUSH_TEMPLATES[action] : null;
  if (!data || !template) {
    return { title: notification.title, message: notification.message };
  }

  const params = extractParams(data, locale);
  const message =
    template.messageWhen && params[template.messageWhen.param]
      ? template.messageWhen.message[locale]
      : template.message[locale];
  return {
    title: fill(template.title[locale], params),
    message: fill(message, params),
  };
}

function asRecord(data: Prisma.JsonValue): Record<string, unknown> | null {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function fill(text: string, params: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? '');
}

const TIER_NAMES: Record<string, LocalizedText> = {
  BRONZE: { vi: 'Đồng', en: 'Bronze', zh: '青铜' },
  SILVER: { vi: 'Bạc', en: 'Silver', zh: '白银' },
  GOLD: { vi: 'Vàng', en: 'Gold', zh: '黄金' },
  PLATINUM: { vi: 'Bạch kim', en: 'Platinum', zh: '铂金' },
  DIAMOND: { vi: 'Kim cương', en: 'Diamond', zh: '钻石' },
};

/** Integer VND, no minor units: `100.000đ` for vi, `₫100,000` otherwise. */
function formatVnd(amount: number, locale: PushLocale): string {
  const grouped = (sep: string) =>
    String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return locale === 'vi' ? `${grouped('.')}đ` : `₫${grouped(',')}`;
}

/** Same key aliases as the app's `_getTranslationParams`. */
function extractParams(
  data: Record<string, unknown>,
  locale: PushLocale
): Record<string, string> {
  const params: Record<string, string> = {};
  const read = (target: string, ...sources: string[]) => {
    for (const source of sources) {
      const value = data[source];
      if (typeof value === 'string' && value.length > 0) {
        params[target] = value;
        return;
      }
    }
  };

  for (const key of [
    'sessionName',
    'clubName',
    'tournamentName',
    'actorName',
    'requesterName',
    'categoryName',
    'response',
    'userName',
    'feedbackTitle',
    'note',
    'hostNotes',
    'reason',
    'senderName',
    'className',
  ]) {
    read(key, key);
  }
  read('venueName', 'venueName', 'name');
  read('rejectionReason', 'rejectionReason', 'adminNote');
  read('courtName', 'courtName', 'courtDisplayName', 'court');
  // The rejected-with-reason string names its placeholder `{reason}`.
  if (!params.reason && params.response) params.reason = params.response;

  // Raw numbers are stored; formatting is per device locale.
  if (typeof data.amount === 'number') {
    params.amount = formatVnd(data.amount, locale);
  }
  for (const key of ['count', 'totalPoints']) {
    const value = data[key];
    if (typeof value === 'number') params[key] = String(Math.round(value));
  }
  if (typeof data.tier === 'string') {
    params.tier = TIER_NAMES[data.tier]?.[locale] ?? data.tier;
  }
  return params;
}
