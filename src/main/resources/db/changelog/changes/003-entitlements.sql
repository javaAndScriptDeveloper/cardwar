--liquibase formatted sql

--changeset cardwar:008-unlock-rule-table
--comment How a target may be acquired. Thresholds and prices are data, never constants in code.
CREATE TABLE unlock_rule (
    id          UUID        PRIMARY KEY,
    target_type VARCHAR(16) NOT NULL,
    target_id   UUID        NOT NULL,
    rule_type   VARCHAR(16) NOT NULL,
    threshold   INTEGER,
    price       BIGINT,
    currency    VARCHAR(16),
    CONSTRAINT uq_unlock_rule_target UNIQUE (target_type, target_id),
    CONSTRAINT ck_unlock_rule_target_type CHECK (target_type IN ('SKIN', 'THEME')),
    CONSTRAINT ck_unlock_rule_type CHECK (rule_type IN ('FREE', 'PROGRESS', 'CURRENCY', 'PURCHASE')),
    CONSTRAINT ck_unlock_rule_progress CHECK (rule_type <> 'PROGRESS' OR threshold IS NOT NULL),
    CONSTRAINT ck_unlock_rule_priced CHECK (rule_type NOT IN ('CURRENCY', 'PURCHASE') OR price IS NOT NULL)
);
--rollback DROP TABLE unlock_rule;

--changeset cardwar:009-entitlement-table
--comment What a player owns. The uniqueness constraint is what makes a duplicate grant a database error.
CREATE TABLE entitlement (
    id          UUID        PRIMARY KEY,
    player_id   UUID        NOT NULL REFERENCES player (id) ON DELETE CASCADE,
    target_type VARCHAR(16) NOT NULL,
    target_id   UUID        NOT NULL,
    source      VARCHAR(16) NOT NULL,
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    CONSTRAINT uq_entitlement_player_target UNIQUE (player_id, target_type, target_id),
    CONSTRAINT ck_entitlement_target_type CHECK (target_type IN ('SKIN', 'THEME')),
    CONSTRAINT ck_entitlement_source CHECK (source IN ('FREE', 'PROGRESS', 'CURRENCY', 'PURCHASE'))
);
--rollback DROP TABLE entitlement;

--changeset cardwar:010-entitlement-player-index
CREATE INDEX ix_entitlement_player ON entitlement (player_id);
--rollback DROP INDEX ix_entitlement_player;
