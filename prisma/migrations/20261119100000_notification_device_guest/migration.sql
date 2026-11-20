-- A signed-out install can now register its FCM token for general admin
-- broadcasts (POST /notifications/guest-devices). Its row has no user until
-- the person signs in and the same token is upserted with a userId.
-- Additive: installed app versions only ever send an authenticated userId.
ALTER TABLE "notification_devices" ALTER COLUMN "userId" DROP NOT NULL;
