import 'stream-chat';

declare module 'stream-chat' {
  interface CustomChannelData {
    vmito_state?: 'pending' | 'active';
    vmito_requester_id?: string;
  }
}
