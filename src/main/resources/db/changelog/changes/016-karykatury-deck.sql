--liquibase formatted sql

--changeset cardwar:016-karykatury-deck
--comment The likeness deck «Карикатури» (client pack karykatury: two LoRA caricatures per persona, two personas per rank). Free while the owner play-tests it on production; the price and the paid voice lines come with #103.
INSERT INTO shop_item (code, item_type, content_ref, name_uk, price, is_default, sort_order, unlock_kind, unlock_value, drop_slot) VALUES
    ('deck-karykatury', 'DECK', 'karykatury', 'Карикатури', 0, FALSE, 20, 'COINS', 0, NULL);
--rollback DELETE FROM shop_item WHERE code = 'deck-karykatury';
