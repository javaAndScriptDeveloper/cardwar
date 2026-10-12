--liquibase formatted sql

--changeset cardwar:011-ledger-reference-length
--comment Telegram Stars charge ids are long opaque strings (over 100 characters); the ledger reference must hold "stars:" plus one, or a paid top-up could not be recorded.
ALTER TABLE coin_transaction ALTER COLUMN reference TYPE VARCHAR(255);
--rollback ALTER TABLE coin_transaction ALTER COLUMN reference TYPE VARCHAR(64);
