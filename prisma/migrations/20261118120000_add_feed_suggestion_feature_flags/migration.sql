-- Kill switches for the app's Bảng tin suggestion rails (Kèo / Nhóm / Giải),
-- one per section so a misbehaving one can be turned off without an app
-- release. Off by default: switch on only after this backend (friendPreview,
-- withinHours, joinableOnly, registrationOpenOnly) is deployed.
INSERT INTO "feature_flags" ("id", "key", "enabled", "description", "createdAt", "updatedAt")
VALUES
  (
    'cfeatureflag0feedsuggses01',
    'FEED_SUGGEST_SESSIONS_ENABLED',
    false,
    'Shows the "Kèo phù hợp với bạn" rail in the app''s Bảng tin (GET /sessions/available?sortBy=recommended&withinHours=48).',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cfeatureflag0feedsuggclb01',
    'FEED_SUGGEST_CLUBS_ENABLED',
    false,
    'Shows the "Nhóm có thể bạn thích" rail in the app''s Bảng tin (GET /clubs?sortBy=recommended&joinableOnly=true).',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'cfeatureflag0feedsuggtrn01',
    'FEED_SUGGEST_TOURNAMENTS_ENABLED',
    false,
    'Shows the "Giải đang mở đăng ký" rail in the app''s Bảng tin (GET /tournaments?sortBy=recommended&registrationOpenOnly=true).',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO NOTHING;
