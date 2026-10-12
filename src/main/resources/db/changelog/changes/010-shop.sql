--liquibase formatted sql

--changeset cardwar:010-shop
--comment Cosmetics for coins. shop_item is the catalogue (the contentRef points at a client content pack or a built-in style); owned_item records purchases; loadout holds what is equipped per type. Default items are owned by everybody without a row.
CREATE TABLE shop_item (
    code        VARCHAR(64)  PRIMARY KEY,
    item_type   VARCHAR(16)  NOT NULL,
    content_ref VARCHAR(64)  NOT NULL,
    name_uk     VARCHAR(128) NOT NULL,
    price       BIGINT       NOT NULL,
    is_default  BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_shop_item_type CHECK (item_type IN ('DECK', 'CARD_BACK', 'TABLE', 'FRAME', 'EMOTE')),
    CONSTRAINT ck_shop_item_price CHECK (price >= 0)
);
CREATE TABLE owned_item (
    player_id   UUID        NOT NULL REFERENCES player (id) ON DELETE CASCADE,
    item_code   VARCHAR(64) NOT NULL REFERENCES shop_item (code),
    source      VARCHAR(16) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (player_id, item_code)
);
CREATE TABLE loadout (
    player_id UUID        NOT NULL REFERENCES player (id) ON DELETE CASCADE,
    item_type VARCHAR(16) NOT NULL,
    item_code VARCHAR(64) NOT NULL REFERENCES shop_item (code),
    PRIMARY KEY (player_id, item_type)
);
INSERT INTO shop_item (code, item_type, content_ref, name_uk, price, is_default, sort_order) VALUES
    ('deck-classic', 'DECK', 'classic', 'Класична колода', 0, TRUE, 10),
    ('deck-memes-demo', 'DECK', 'memes-demo', 'Мемна колода (демо)', 1000, FALSE, 20),
    ('back-classic', 'CARD_BACK', 'classic', 'Класична сорочка', 0, TRUE, 10),
    ('back-trident', 'CARD_BACK', 'trident', 'Тризуб', 300, FALSE, 20),
    ('back-sunflower', 'CARD_BACK', 'sunflower', 'Соняшники', 300, FALSE, 30),
    ('table-green', 'TABLE', 'green', 'Зелене сукно', 0, TRUE, 10),
    ('table-night', 'TABLE', 'night', 'Нічний Київ', 500, FALSE, 20),
    ('table-borscht', 'TABLE', 'borscht', 'Борщове сукно', 500, FALSE, 30),
    ('frame-gold', 'FRAME', 'gold', 'Золота рамка', 800, FALSE, 10),
    ('frame-blue-yellow', 'FRAME', 'blue-yellow', 'Синьо-жовта рамка', 600, FALSE, 20),
    ('emote-like', 'EMOTE', 'like', 'Лайк', 100, FALSE, 10),
    ('emote-laugh', 'EMOTE', 'laugh', 'Регіт', 100, FALSE, 20),
    ('emote-clown', 'EMOTE', 'clown', 'Клоун', 150, FALSE, 30),
    ('emote-fire', 'EMOTE', 'fire', 'Вогонь', 150, FALSE, 40);
--rollback DROP TABLE loadout;
--rollback DROP TABLE owned_item;
--rollback DROP TABLE shop_item;
