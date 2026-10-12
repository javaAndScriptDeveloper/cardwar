--liquibase formatted sql

--changeset cardwar:009-matchmaking
--comment Quick match: one row per waiting player. Pairing happens under a transaction-scoped advisory lock per stake table, so two players entering together always pair; the waiting player learns the duel from matched_duel_id.
CREATE TABLE matchmaking_entry (
    player_id       UUID        PRIMARY KEY REFERENCES player (id) ON DELETE CASCADE,
    stake           BIGINT      NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    matched_duel_id UUID        NULL
);
CREATE INDEX ix_matchmaking_entry_waiting ON matchmaking_entry (stake, created_at) WHERE matched_duel_id IS NULL;
--rollback DROP TABLE matchmaking_entry;
