--liquibase formatted sql

--changeset cardwar:012-player-telegram-profile
--comment Opponents are shown by their Telegram name, @handle and photo rather than the internal tg_<id> username; all three are refreshed on every Telegram sign-in, and both new columns stay null for password accounts and for users who hide them.
ALTER TABLE player ADD COLUMN telegram_handle VARCHAR(32) NULL;
ALTER TABLE player ADD COLUMN photo_url VARCHAR(512) NULL;
--rollback ALTER TABLE player DROP COLUMN photo_url;
--rollback ALTER TABLE player DROP COLUMN telegram_handle;
