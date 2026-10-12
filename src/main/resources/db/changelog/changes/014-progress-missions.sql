--liquibase formatted sql

--changeset cardwar:014-progress-missions
--comment Retention hooks. player_progress gains the win streak (reset by a loss, kept by a draw), the best streak ever and XP, all written by the account service in the duel's completion transaction. daily_mission holds one row per player, Kyiv day and mission code, created on first progress; claimed_at marks the reward as paid. streak_reminder records that the bonus-streak reminder went out that day, so a restart never sends it twice.
ALTER TABLE player_progress ADD COLUMN win_streak INT NOT NULL DEFAULT 0;
ALTER TABLE player_progress ADD COLUMN best_win_streak INT NOT NULL DEFAULT 0;
ALTER TABLE player_progress ADD COLUMN xp INT NOT NULL DEFAULT 0;
CREATE TABLE daily_mission (
    player_id  UUID        NOT NULL REFERENCES player (id) ON DELETE CASCADE,
    day        DATE        NOT NULL,
    code       VARCHAR(16) NOT NULL,
    progress   INT         NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ NULL,
    PRIMARY KEY (player_id, day, code)
);
CREATE TABLE streak_reminder (
    player_id UUID NOT NULL REFERENCES player (id) ON DELETE CASCADE,
    day       DATE NOT NULL,
    PRIMARY KEY (player_id, day)
);
--rollback DROP TABLE streak_reminder;
--rollback DROP TABLE daily_mission;
--rollback ALTER TABLE player_progress DROP COLUMN xp;
--rollback ALTER TABLE player_progress DROP COLUMN best_win_streak;
--rollback ALTER TABLE player_progress DROP COLUMN win_streak;
