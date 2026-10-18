--liquibase formatted sql

--changeset cardwar:017-karykatury-default-deck
--comment The owner wants everybody to start with the likeness deck. Defaults resolve per slot in sort order, so «Карикатури» moves ahead of the classic deck; both stay default (free, owned by all), the classic deck is one tap away in the settings.
UPDATE shop_item SET is_default = TRUE, sort_order = 5 WHERE code = 'deck-karykatury';
--rollback UPDATE shop_item SET is_default = FALSE, sort_order = 20 WHERE code = 'deck-karykatury';
