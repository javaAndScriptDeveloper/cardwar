--liquibase formatted sql

--changeset cardwar:007-wallet
--comment Soft coins. coin_transaction is the append-only ledger and the truth; wallet.balance is its running total, updated in the same transaction under a row lock. (player_id, kind, reference) makes every movement idempotent: a retried settle or claim never pays twice.
CREATE TABLE wallet (
    player_id  UUID        PRIMARY KEY REFERENCES player (id) ON DELETE CASCADE,
    balance    BIGINT      NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_wallet_balance_non_negative CHECK (balance >= 0)
);
CREATE TABLE coin_transaction (
    id         UUID        PRIMARY KEY,
    player_id  UUID        NOT NULL REFERENCES player (id) ON DELETE CASCADE,
    amount     BIGINT      NOT NULL,
    kind       VARCHAR(32) NOT NULL,
    reference  VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_coin_transaction_key UNIQUE (player_id, kind, reference)
);
CREATE INDEX ix_coin_transaction_player_created ON coin_transaction (player_id, created_at DESC);
CREATE INDEX ix_coin_transaction_reference ON coin_transaction (reference);
CREATE TABLE daily_bonus_claim (
    player_id  UUID        NOT NULL REFERENCES player (id) ON DELETE CASCADE,
    bonus_date DATE        NOT NULL,
    streak_day INT         NOT NULL,
    amount     BIGINT      NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (player_id, bonus_date)
);
-- Existing players keep their old balance (LEGACY) and get the starter coins every new player gets.
INSERT INTO coin_transaction (id, player_id, amount, kind, reference, created_at)
SELECT gen_random_uuid(), player_id, currency_balance, 'LEGACY', 'legacy-balance', now()
FROM player_progress WHERE currency_balance > 0;
INSERT INTO coin_transaction (id, player_id, amount, kind, reference, created_at)
SELECT gen_random_uuid(), id, 500, 'STARTER', 'starter', now() FROM player;
INSERT INTO wallet (player_id, balance, updated_at)
SELECT p.id, COALESCE(pp.currency_balance, 0) + 500, now()
FROM player p LEFT JOIN player_progress pp ON pp.player_id = p.id;
--rollback DROP TABLE daily_bonus_claim;
--rollback DROP TABLE coin_transaction;
--rollback DROP TABLE wallet;
