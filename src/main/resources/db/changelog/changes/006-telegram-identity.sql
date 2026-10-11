--liquibase formatted sql

--changeset cardwar:006-player-telegram-identity
--comment A Telegram user signs in with Telegram's signed initData, never a password: the account is keyed on the Telegram user id and carries no hash at all.
ALTER TABLE player ADD COLUMN telegram_user_id BIGINT NULL;
ALTER TABLE player ADD CONSTRAINT uq_player_telegram_user_id UNIQUE (telegram_user_id);
ALTER TABLE player ALTER COLUMN password_hash DROP NOT NULL;
--rollback ALTER TABLE player ALTER COLUMN password_hash SET NOT NULL;
--rollback ALTER TABLE player DROP CONSTRAINT uq_player_telegram_user_id;
--rollback ALTER TABLE player DROP COLUMN telegram_user_id;
