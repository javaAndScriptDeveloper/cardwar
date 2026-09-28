--liquibase formatted sql

--changeset cardwar:001-player-table
--comment Player accounts. Credentials are stored only as a BCrypt hash; nothing here is reversible.
CREATE TABLE player (
    id            UUID         PRIMARY KEY,
    username      VARCHAR(32)  NOT NULL,
    password_hash VARCHAR(72)  NOT NULL,
    display_name  VARCHAR(64)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_player_username UNIQUE (username)
);
--rollback DROP TABLE player;

--changeset cardwar:002-player-progress-table
--comment Gameplay progress. Kept in its own table because it is written after every duel while the account row is not.
CREATE TABLE player_progress (
    player_id        UUID        PRIMARY KEY REFERENCES player (id) ON DELETE CASCADE,
    duels_played     INTEGER     NOT NULL DEFAULT 0,
    duels_won        INTEGER     NOT NULL DEFAULT 0,
    currency_balance BIGINT      NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_player_progress_non_negative
        CHECK (duels_played >= 0 AND duels_won >= 0 AND currency_balance >= 0)
);
--rollback DROP TABLE player_progress;
