--liquibase formatted sql

--changeset cardwar:015-weekly-drop-slots
--comment The weekly drop rotates over four ISO-week slots but only two were seeded, so two weeks in four had no drop at all. One item per remaining slot keeps «Дроп тижня» true every week.
INSERT INTO shop_item (code, item_type, content_ref, name_uk, price, is_default, sort_order, unlock_kind, unlock_value, drop_slot) VALUES
    ('back-chornobaivka', 'CARD_BACK', 'chornobaivka', 'Чорнобаївка', 450, FALSE, 80, 'COINS', 0, 2),
    ('table-metro', 'TABLE', 'metro', 'Київське метро', 700, FALSE, 70, 'COINS', 0, 3);
--rollback DELETE FROM shop_item WHERE code IN ('back-chornobaivka', 'table-metro');
