--liquibase formatted sql

--changeset cardwar:008-duel-result-stake
--comment The coins each player put in, kept with the result so the history can show what a duel was played for.
ALTER TABLE duel_result ADD COLUMN stake BIGINT NOT NULL DEFAULT 0;
--rollback ALTER TABLE duel_result DROP COLUMN stake;
