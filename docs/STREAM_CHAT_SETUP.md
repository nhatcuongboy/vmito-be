# Stream Chat backend setup

Vmito uses Stream only for 1:1 message storage, delivery and realtime state.
PostgreSQL stores consent, conversation workflow metadata, blocks and the FCM
outbox; it never stores chat message text.

## Environment setup

Create separate Stream applications for staging and production, then configure
each deployment with its own values:

```env
STREAM_API_KEY=<environment Stream key>
STREAM_API_SECRET=<environment Stream secret>
STREAM_CHAT_TERMS_VERSION=2026-09-13
```

Never expose `STREAM_API_SECRET` to a client. `GET /api/chat/session` only
returns the public API key and a one-hour user token after the current terms
version has been accepted.

On startup, the backend idempotently creates/updates:

- channel type `vmito_dm`;
- channel roles `vmito_pending_sender` and `vmito_pending_recipient`;
- Vietnamese/Chinese blocklist `vmito_vi_zh` (dashboard additions are kept);
- server-enforced limits for text length and disabled V1 features.

Simple automod supplies the English baseline. Review and extend the custom
blocklist in Stream's dashboard as moderation learns new terms.

## Deployment order

1. Keep `CHAT_ENABLED=false` (the migration seeds this value).
2. Deploy the backend and apply Prisma migrations.
3. Verify startup can configure Stream without `Stream Chat bootstrap failed`.
4. Configure Stream's Firebase/APNs push provider for active conversations.
   Pending requests intentionally use Vmito's FCM outbox instead.
5. Exercise pending, consent, decline, cancel, block and account deletion with
   two staging accounts.
6. Enable `CHAT_ENABLED` only after the compatible app release is available.

The flag can be changed through the normal environment/database operational
process (for example Prisma Studio). A missing key/secret makes chat report
`enabled=false`; it does not affect the rest of Vmito.

## Privacy and moderation invariants

- A recipient without current consent receives no Stream token and `/requests`
  exposes sender public data only, never text, message ID or CID.
- The initial pending message is sent server-side with a stable UUID. Retries
  reuse that UUID, so they cannot create a second message.
- Pending sender/recipient roles do not have `Create Message`; only active
  `channel_member` roles do.
- Pending FCM payloads contain request ID and sender name only. The durable
  outbox retries FCM independently of Stream message creation.
- Account deletion hard-deletes the Stream user and conversation channels
  before local anonymization/deletion.

Before production rollout, update Terms and Privacy Policy to name Stream as a
data processor and disclose that an incoming message can be stored before the
recipient enables chat. Complete legal review before enabling the feature.
