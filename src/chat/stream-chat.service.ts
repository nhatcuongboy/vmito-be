import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BuiltinPermissions, StreamChat } from 'stream-chat';

export const VMITO_CHANNEL_TYPE = 'vmito_dm';
export const PENDING_SENDER_ROLE = 'vmito_pending_sender';
export const PENDING_RECIPIENT_ROLE = 'vmito_pending_recipient';
export const VMITO_BLOCKLIST = 'vmito_vi_zh';
// A deliberately small baseline. Moderators can extend this list in Stream's
// dashboard without a deploy; simple automod remains responsible for English.
export const VMITO_BLOCKLIST_WORDS = [
  'địt',
  'đụ',
  'đéo',
  'lồn',
  'cặc',
  'chó chết',
  '操你妈',
  '傻逼',
  '婊子',
  '去死',
];
export const VMITO_ACTIVE_PERMISSIONS = [
  BuiltinPermissions.ReadOwnChannel,
  BuiltinPermissions.CreateMessage,
  BuiltinPermissions.UpdateOwnMessage,
  BuiltinPermissions.DeleteOwnMessage,
];
export const VMITO_PENDING_PERMISSIONS = [BuiltinPermissions.ReadOwnChannel];
export const VMITO_CHANNEL_SETTINGS = {
  automod: 'simple' as const,
  automod_behavior: 'flag' as const,
  blocklist: VMITO_BLOCKLIST,
  blocklist_behavior: 'flag' as const,
  max_message_length: 2000,
  connect_events: true,
  custom_events: false,
  commands: [],
  delivery_events: true,
  mark_messages_pending: false,
  mutes: true,
  polls: false,
  push_notifications: true,
  quotes: false,
  reactions: false,
  read_events: true,
  reminders: false,
  replies: false,
  search: false,
  shared_locations: false,
  typing_events: true,
  uploads: false,
  url_enrichment: false,
};

@Injectable()
export class StreamChatService implements OnModuleInit {
  private readonly logger = new Logger(StreamChatService.name);
  private readonly apiKey: string;
  private readonly client?: StreamChat;
  private infrastructurePromise?: Promise<void>;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('STREAM_API_KEY')?.trim() ?? '';
    const secret = this.config.get<string>('STREAM_API_SECRET')?.trim() ?? '';
    if (this.apiKey && secret)
      this.client = new StreamChat(this.apiKey, secret);
  }

  get isConfigured() {
    return this.client != null;
  }

  get key() {
    return this.apiKey;
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await this.ensureInfrastructure();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Stream Chat bootstrap failed: ${message}`);
    }
  }

  async ensureInfrastructure() {
    if (!this.client) this.unavailable();
    this.infrastructurePromise ??= this.configureInfrastructure().catch(
      (error) => {
        this.infrastructurePromise = undefined;
        throw error;
      }
    );
    return this.infrastructurePromise;
  }

  createToken(userId: string, expiresAt: Date) {
    const client = this.requiredClient();
    return client.createToken(userId, Math.floor(expiresAt.getTime() / 1000));
  }

  async upsertMinimalUser(userId: string) {
    await this.requiredClient().upsertUser({ id: userId });
  }

  async upsertUser(user: { id: string; name: string; image: string | null }) {
    await this.requiredClient().upsertUser({
      id: user.id,
      name: user.name,
      ...(user.image ? { image: user.image } : {}),
    });
  }

  async createPendingChannel(input: {
    channelId: string;
    senderId: string;
    recipientId: string;
    text: string;
    messageId: string;
  }) {
    const client = this.requiredClient();
    const channel = client.channel(VMITO_CHANNEL_TYPE, input.channelId, {
      members: [
        {
          user_id: input.senderId,
          channel_role: PENDING_SENDER_ROLE,
        },
        {
          user_id: input.recipientId,
          channel_role: PENDING_RECIPIENT_ROLE,
        },
      ],
      vmito_state: 'pending',
      vmito_requester_id: input.senderId,
    });
    try {
      await channel.create();
    } catch (error) {
      if (!this.isConflict(error)) throw error;
    }
    try {
      const result = await channel.sendMessage(
        {
          id: input.messageId,
          text: input.text,
          user_id: input.senderId,
        },
        { skip_push: true, skip_enrich_url: true, force_moderation: true }
      );
      return { channelId: input.channelId, messageId: result.message.id };
    } catch (error) {
      // Retrying after a process/DB failure uses the same UUID. Stream's
      // unique message id is the final guard against a second initial message.
      if (!this.isConflict(error)) throw error;
      const existing = await client.getMessage(input.messageId);
      return { channelId: input.channelId, messageId: existing.message.id };
    }
  }

  async createActiveChannel(input: {
    channelId: string;
    firstUserId: string;
    secondUserId: string;
  }) {
    const channel = this.requiredClient().channel(
      VMITO_CHANNEL_TYPE,
      input.channelId,
      {
        members: [input.firstUserId, input.secondUserId],
        vmito_state: 'active',
      }
    );
    await channel.create();
    return input.channelId;
  }

  async activateChannel(channelId: string, userIds: [string, string]) {
    const channel = this.requiredClient().channel(
      VMITO_CHANNEL_TYPE,
      channelId
    );
    await channel.assignRoles(
      userIds.map((userId) => ({
        user_id: userId,
        channel_role: 'channel_member',
      }))
    );
    await channel.update({ vmito_state: 'active' });
  }

  async deleteChannel(channelId: string) {
    try {
      await this.requiredClient()
        .channel(VMITO_CHANNEL_TYPE, channelId)
        .delete({ hard_delete: true });
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
  }

  async blockUser(blockerId: string, blockedId: string) {
    await this.requiredClient().blockUser(blockedId, blockerId);
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.requiredClient().unBlockUser(blockedId, blockerId);
  }

  async deleteUserData(userId: string) {
    const client = this.requiredClient();
    let result: unknown;
    try {
      result = await client.deleteUser(userId, {
        hard_delete: true,
        mark_messages_deleted: true,
        delete_conversation_channels: true,
      });
    } catch (error) {
      // Account deletion is retryable. If Stream completed a prior attempt
      // but the local transaction failed, the missing remote user is success.
      if (this.isNotFound(error)) return;
      throw error;
    }
    const taskId =
      result &&
      typeof result === 'object' &&
      'task_id' in result &&
      typeof result.task_id === 'string'
        ? result.task_id
        : undefined;
    if (!taskId) return;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const task = await client.getTask(taskId);
      if (task.status === 'completed') return;
      if (task.status === 'failed' || task.error) {
        throw new Error(task.error?.description ?? 'Stream deletion failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Timed out waiting for Stream data deletion');
  }

  private requiredClient() {
    if (!this.client) this.unavailable();
    return this.client;
  }

  private unavailable(): never {
    throw new ServiceUnavailableException('Chat service is not configured');
  }

  private isNotFound(error: unknown) {
    return (
      (error as { status?: number })?.status === 404 ||
      (error as { response?: { status?: number } })?.response?.status === 404 ||
      (error as { code?: number })?.code === 16
    );
  }

  private isConflict(error: unknown) {
    const status =
      (error as { status?: number })?.status ??
      (error as { response?: { status?: number } })?.response?.status;
    const code = (error as { code?: number })?.code;
    const message = error instanceof Error ? error.message : '';
    return (
      status === 409 ||
      (code === 4 && /already exists|duplicate/i.test(message))
    );
  }

  private async configureInfrastructure() {
    const client = this.requiredClient();
    const blocklists = await client.listBlockLists();
    const currentBlocklist = blocklists.blocklists.find(
      (candidate) => candidate.name === VMITO_BLOCKLIST
    );
    if (currentBlocklist) {
      await client.updateBlockList(VMITO_BLOCKLIST, {
        // Keep words moderators added in Stream's dashboard while making
        // sure the version-controlled baseline is always present.
        words: [
          ...new Set([...currentBlocklist.words, ...VMITO_BLOCKLIST_WORDS]),
        ],
      });
    } else {
      await client.createBlockList({
        name: VMITO_BLOCKLIST,
        words: VMITO_BLOCKLIST_WORDS,
        is_confusable_folding_enabled: true,
        is_leet_check_enabled: true,
        is_plural_check_enabled: true,
        is_substring_matching_enabled: false,
      });
    }
    const roles = await client.listRoles();
    for (const role of [PENDING_SENDER_ROLE, PENDING_RECIPIENT_ROLE]) {
      if (!roles.roles.some((candidate) => candidate.name === role)) {
        await client.createRole(role);
      }
    }

    try {
      const current = await client.getChannelType(VMITO_CHANNEL_TYPE);
      await client.updateChannelType(VMITO_CHANNEL_TYPE, {
        ...VMITO_CHANNEL_SETTINGS,
        grants: {
          ...current.grants,
          user: [],
          channel_member: VMITO_ACTIVE_PERMISSIONS,
          [PENDING_SENDER_ROLE]: VMITO_PENDING_PERMISSIONS,
          [PENDING_RECIPIENT_ROLE]: [],
        },
      });
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      if (status !== 404) throw error;
      await client.createChannelType({
        name: VMITO_CHANNEL_TYPE,
        ...VMITO_CHANNEL_SETTINGS,
        grants: {
          user: [],
          admin: ['*'],
          channel_moderator: ['*'],
          channel_member: VMITO_ACTIVE_PERMISSIONS,
          [PENDING_SENDER_ROLE]: VMITO_PENDING_PERMISSIONS,
          [PENDING_RECIPIENT_ROLE]: [],
        },
      });
    }
  }
}
