--liquibase formatted sql

--changeset cardwar:003-rarity-table
--comment Rarity carries the default scoring multiplier. Multipliers are data so they can be retuned without a deploy.
CREATE TABLE rarity (
    code               VARCHAR(32)   PRIMARY KEY,
    name               VARCHAR(64)   NOT NULL,
    default_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    sort_order         INTEGER       NOT NULL DEFAULT 0,
    CONSTRAINT ck_rarity_multiplier_positive CHECK (default_multiplier > 0)
);
--rollback DROP TABLE rarity;

--changeset cardwar:004-deck-theme-table
--comment A deck theme is a complete set of skins for the 36 cards.
CREATE TABLE deck_theme (
    id          UUID         PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL,
    name        VARCHAR(128) NOT NULL,
    description VARCHAR(512),
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_deck_theme_code UNIQUE (code)
);
--rollback DROP TABLE deck_theme;

--changeset cardwar:005-deck-theme-single-default
--comment At most one default theme, enforced by the database rather than by hopeful application code.
CREATE UNIQUE INDEX ux_deck_theme_single_default ON deck_theme (is_default) WHERE is_default;
--rollback DROP INDEX ux_deck_theme_single_default;

--changeset cardwar:006-card-skin-table
--comment Rank and suit are stored as the engine's own enum names, so reassigning a character is an UPDATE.
CREATE TABLE card_skin (
    id                  UUID          PRIMARY KEY,
    theme_id            UUID          NOT NULL REFERENCES deck_theme (id) ON DELETE CASCADE,
    card_rank           VARCHAR(8)    NOT NULL,
    card_suit           VARCHAR(16)   NOT NULL,
    code                VARCHAR(64)   NOT NULL,
    display_name        VARCHAR(128)  NOT NULL,
    image_ref           VARCHAR(256)  NOT NULL,
    rarity_code         VARCHAR(32)   NOT NULL REFERENCES rarity (code),
    multiplier_override NUMERIC(6, 2),
    active              BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_card_skin_code UNIQUE (code),
    CONSTRAINT uq_card_skin_theme_rank_suit UNIQUE (theme_id, card_rank, card_suit),
    CONSTRAINT ck_card_skin_rank
        CHECK (card_rank IN ('SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'JACK', 'QUEEN', 'KING', 'ACE')),
    CONSTRAINT ck_card_skin_suit
        CHECK (card_suit IN ('CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES')),
    CONSTRAINT ck_card_skin_multiplier_positive
        CHECK (multiplier_override IS NULL OR multiplier_override > 0)
);
--rollback DROP TABLE card_skin;

--changeset cardwar:007-card-skin-theme-index
CREATE INDEX ix_card_skin_theme ON card_skin (theme_id);
--rollback DROP INDEX ix_card_skin_theme;
