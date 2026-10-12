--liquibase formatted sql

--changeset cardwar:013-shop-unlocks
--comment Items earned by a win streak (unlock_kind WIN_STREAK, unlock_value = streak length, price 0) and weekly drops (drop_slot: on sale when the Kyiv ISO week % 4 equals the slot). Plus the catalogue people asked for: two satire decks, new backs, tables, frames and phrase emotes whose names are the phrases.
ALTER TABLE shop_item ADD COLUMN unlock_kind VARCHAR(16) NOT NULL DEFAULT 'COINS';
ALTER TABLE shop_item ADD COLUMN unlock_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shop_item ADD COLUMN drop_slot INTEGER NULL;
ALTER TABLE shop_item ADD CONSTRAINT ck_shop_item_unlock_kind CHECK (unlock_kind IN ('COINS', 'WIN_STREAK'));
ALTER TABLE shop_item ADD CONSTRAINT ck_shop_item_unlock_value CHECK (unlock_value >= 0);
ALTER TABLE shop_item ADD CONSTRAINT ck_shop_item_drop_slot CHECK (drop_slot IS NULL OR drop_slot BETWEEN 0 AND 3);
INSERT INTO shop_item (code, item_type, content_ref, name_uk, price, is_default, sort_order, unlock_kind, unlock_value, drop_slot) VALUES
    ('deck-sluhy-narodu', 'DECK', 'sluhy-narodu', 'Слуги народу', 1500, FALSE, 30, 'COINS', 0, NULL),
    ('deck-blogery', 'DECK', 'blogery', 'Блогери', 0, FALSE, 40, 'WIN_STREAK', 3, NULL),
    ('back-bayraktar', 'CARD_BACK', 'bayraktar', 'Байрактар', 400, FALSE, 40, 'COINS', 0, NULL),
    ('back-palianytsia', 'CARD_BACK', 'palianytsia', 'Паляниця', 300, FALSE, 50, 'COINS', 0, NULL),
    ('back-ukrzaliznytsia', 'CARD_BACK', 'ukrzaliznytsia', 'Укрзалізниця', 300, FALSE, 60, 'COINS', 0, NULL),
    ('back-bavovna', 'CARD_BACK', 'bavovna', 'Бавовна', 500, FALSE, 70, 'COINS', 0, 0),
    ('table-blackout', 'TABLE', 'blackout', 'Хрещатик при блекауті', 600, FALSE, 40, 'COINS', 0, NULL),
    ('table-bukovel', 'TABLE', 'bukovel', 'Буковель', 600, FALSE, 50, 'COINS', 0, NULL),
    ('table-kabmin', 'TABLE', 'kabmin', 'Кабмін', 800, FALSE, 60, 'COINS', 0, 1),
    ('frame-tryzub-gold', 'FRAME', 'tryzub-gold', 'Золотий тризуб', 900, FALSE, 30, 'COINS', 0, NULL),
    ('frame-vyshyvanka', 'FRAME', 'vyshyvanka', 'Вишиванка', 700, FALSE, 40, 'COINS', 0, NULL),
    ('frame-kozak', 'FRAME', 'kozak', 'Козак', 0, FALSE, 50, 'WIN_STREAK', 5, NULL),
    ('emote-minus-money', 'EMOTE', 'minus-money', 'Мінус гроші', 150, FALSE, 50, 'COINS', 0, NULL),
    ('emote-chumachecha', 'EMOTE', 'chumachecha', 'Чумачеча осінь', 150, FALSE, 60, 'COINS', 0, NULL),
    ('emote-ty-sho', 'EMOTE', 'ty-sho', 'Ти шо, Кличко?', 200, FALSE, 70, 'COINS', 0, NULL),
    ('emote-palianytsia', 'EMOTE', 'palianytsia', 'Скажи «паляниця»', 150, FALSE, 80, 'COINS', 0, NULL),
    ('emote-bavovna', 'EMOTE', 'bavovna', 'Бавовна!', 200, FALSE, 90, 'COINS', 0, NULL),
    ('emote-dobroho-vechora', 'EMOTE', 'dobroho-vechora', 'Доброго вечора, ми з України', 100, FALSE, 100, 'COINS', 0, NULL);
--rollback DELETE FROM shop_item WHERE code IN ('deck-sluhy-narodu', 'deck-blogery', 'back-bayraktar', 'back-palianytsia', 'back-ukrzaliznytsia', 'back-bavovna', 'table-blackout', 'table-bukovel', 'table-kabmin', 'frame-tryzub-gold', 'frame-vyshyvanka', 'frame-kozak', 'emote-minus-money', 'emote-chumachecha', 'emote-ty-sho', 'emote-palianytsia', 'emote-bavovna', 'emote-dobroho-vechora');
--rollback ALTER TABLE shop_item DROP CONSTRAINT ck_shop_item_drop_slot;
--rollback ALTER TABLE shop_item DROP CONSTRAINT ck_shop_item_unlock_value;
--rollback ALTER TABLE shop_item DROP CONSTRAINT ck_shop_item_unlock_kind;
--rollback ALTER TABLE shop_item DROP COLUMN drop_slot;
--rollback ALTER TABLE shop_item DROP COLUMN unlock_value;
--rollback ALTER TABLE shop_item DROP COLUMN unlock_kind;
