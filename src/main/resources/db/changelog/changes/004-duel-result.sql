--liquibase formatted sql

--changeset cardwar:011-duel-result-table
--comment
--comment The ONLY duel data that reaches Postgres. In-progress hands, table and talon live in the state store
--comment and never touch this database — there is deliberately no column here that could hold one.
CREATE TABLE duel_result (
    id          UUID        PRIMARY KEY,
    duel_id     UUID        NOT NULL,
    player_a    UUID        NOT NULL REFERENCES player (id),
    player_b    UUID        NOT NULL REFERENCES player (id),
    winner_id   UUID        REFERENCES player (id),
    loser_id    UUID        REFERENCES player (id),
    draw        BOOLEAN     NOT NULL,
    end_reason  VARCHAR(32) NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL,
    move_count  INTEGER     NOT NULL,
    CONSTRAINT uq_duel_result_duel UNIQUE (duel_id),
    CONSTRAINT ck_duel_result_distinct_players CHECK (player_a <> player_b),
    CONSTRAINT ck_duel_result_outcome CHECK (
        (draw AND winner_id IS NULL AND loser_id IS NULL)
        OR (NOT draw AND winner_id IS NOT NULL AND loser_id IS NOT NULL AND winner_id <> loser_id)
    )
);
--rollback DROP TABLE duel_result;

--changeset cardwar:012-duel-result-indexes
CREATE INDEX ix_duel_result_player_a ON duel_result (player_a);
CREATE INDEX ix_duel_result_player_b ON duel_result (player_b);
CREATE INDEX ix_duel_result_finished_at ON duel_result (finished_at DESC);
--rollback DROP INDEX ix_duel_result_finished_at;
--rollback DROP INDEX ix_duel_result_player_b;
--rollback DROP INDEX ix_duel_result_player_a;
