--liquibase formatted sql

--changeset cardwar:013-seed-rarities
--comment Multipliers live here, not in code: retuning the economy is an UPDATE, not a deploy.
INSERT INTO rarity (code, name, default_multiplier, sort_order) VALUES
    ('COMMON', 'Common', 1.00, 1),
    ('RARE', 'Rare', 1.50, 2),
    ('EPIC', 'Epic', 2.50, 3),
    ('LEGENDARY', 'Legendary', 5.00, 4);
--rollback DELETE FROM rarity;

--changeset cardwar:014-seed-deck-themes
--comment Classic is the neutral default. Vanguard is an example themed deck of invented characters.
INSERT INTO deck_theme (id, code, name, description, is_default, active) VALUES
    ('dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'CLASSIC', 'Classic', 'The plain 36-card deck. No skins, always available.', TRUE, TRUE),
    ('a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'VANGUARD', 'Vanguard Houses', 'Four invented houses, nine ranks of office each.', FALSE, TRUE);
--rollback DELETE FROM deck_theme;

--changeset cardwar:015-seed-classic-skins
--comment All 36 cards of the neutral deck. Every rank/suit is present exactly once, enforced by uq_card_skin_theme_rank_suit.
INSERT INTO card_skin (id, theme_id, card_rank, card_suit, code, display_name, image_ref, rarity_code, multiplier_override, active) VALUES
    ('f41d0cb2-49ae-5f49-b61e-5b1c8425ec9c', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SIX', 'CLUBS', 'CLASSIC_SIX_CLUBS', 'Six of Clubs', 'classic/six_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('95d738dc-df2d-5a09-8cd5-7f93e2740c61', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SEVEN', 'CLUBS', 'CLASSIC_SEVEN_CLUBS', 'Seven of Clubs', 'classic/seven_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('a2c71c30-bcf2-5747-b853-440c5e559066', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'EIGHT', 'CLUBS', 'CLASSIC_EIGHT_CLUBS', 'Eight of Clubs', 'classic/eight_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('bdb3fb76-170d-5aba-ba20-3d56394fe08c', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'NINE', 'CLUBS', 'CLASSIC_NINE_CLUBS', 'Nine of Clubs', 'classic/nine_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('18244e92-82e3-51dd-942b-095acb954b24', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'TEN', 'CLUBS', 'CLASSIC_TEN_CLUBS', 'Ten of Clubs', 'classic/ten_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('24d4dc41-a0d0-5811-8caf-137494328958', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'JACK', 'CLUBS', 'CLASSIC_JACK_CLUBS', 'Jack of Clubs', 'classic/jack_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('d8a0fa8c-d243-5d9a-94b6-02267d2e3ab6', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'QUEEN', 'CLUBS', 'CLASSIC_QUEEN_CLUBS', 'Queen of Clubs', 'classic/queen_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('301d8717-3985-546b-8bba-c7d77a02d205', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'KING', 'CLUBS', 'CLASSIC_KING_CLUBS', 'King of Clubs', 'classic/king_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('bd843621-2bd3-56bf-b4b8-05acefd5c92c', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'ACE', 'CLUBS', 'CLASSIC_ACE_CLUBS', 'Ace of Clubs', 'classic/ace_of_clubs.svg', 'COMMON', NULL, TRUE),
    ('0a4abfcc-c474-51ef-81c3-edf77145d046', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SIX', 'DIAMONDS', 'CLASSIC_SIX_DIAMONDS', 'Six of Diamonds', 'classic/six_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('dccd52f1-e41d-5011-94fd-0f5198b77a1d', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SEVEN', 'DIAMONDS', 'CLASSIC_SEVEN_DIAMONDS', 'Seven of Diamonds', 'classic/seven_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('2f5af424-35eb-50f9-9a4d-feff099e04d3', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'EIGHT', 'DIAMONDS', 'CLASSIC_EIGHT_DIAMONDS', 'Eight of Diamonds', 'classic/eight_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('f9fcf5b5-12c0-5955-bb18-7bbfffd3fcf7', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'NINE', 'DIAMONDS', 'CLASSIC_NINE_DIAMONDS', 'Nine of Diamonds', 'classic/nine_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('ec27de3d-f5e4-5de9-b48e-79202118b2bf', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'TEN', 'DIAMONDS', 'CLASSIC_TEN_DIAMONDS', 'Ten of Diamonds', 'classic/ten_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('d8323780-8061-5c91-8e7a-4a09110d03bc', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'JACK', 'DIAMONDS', 'CLASSIC_JACK_DIAMONDS', 'Jack of Diamonds', 'classic/jack_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('ae02e4c9-29d3-5504-8ae4-c69c5cdefd95', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'QUEEN', 'DIAMONDS', 'CLASSIC_QUEEN_DIAMONDS', 'Queen of Diamonds', 'classic/queen_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('b31cad01-4bee-58a3-bbd0-6eaf512b2fa9', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'KING', 'DIAMONDS', 'CLASSIC_KING_DIAMONDS', 'King of Diamonds', 'classic/king_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('da785a91-9371-5da7-8693-9fb96b92c078', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'ACE', 'DIAMONDS', 'CLASSIC_ACE_DIAMONDS', 'Ace of Diamonds', 'classic/ace_of_diamonds.svg', 'COMMON', NULL, TRUE),
    ('5b5388c6-caa4-5ba3-a27c-015344d5144a', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SIX', 'HEARTS', 'CLASSIC_SIX_HEARTS', 'Six of Hearts', 'classic/six_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('c60cd909-6b01-55ac-89a4-a10dde7839fd', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SEVEN', 'HEARTS', 'CLASSIC_SEVEN_HEARTS', 'Seven of Hearts', 'classic/seven_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('51d892f3-df27-58bb-82ec-2d18c76afa6a', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'EIGHT', 'HEARTS', 'CLASSIC_EIGHT_HEARTS', 'Eight of Hearts', 'classic/eight_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('a311c808-06e3-5097-a5e2-991d6aa52d20', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'NINE', 'HEARTS', 'CLASSIC_NINE_HEARTS', 'Nine of Hearts', 'classic/nine_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('4c34cea7-be66-5c67-a1ea-9aeab78785bc', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'TEN', 'HEARTS', 'CLASSIC_TEN_HEARTS', 'Ten of Hearts', 'classic/ten_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('449cb7a0-65d5-57c2-88a4-5df884f932f0', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'JACK', 'HEARTS', 'CLASSIC_JACK_HEARTS', 'Jack of Hearts', 'classic/jack_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('a3eead1b-7538-5602-abca-7ef158f18a6b', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'QUEEN', 'HEARTS', 'CLASSIC_QUEEN_HEARTS', 'Queen of Hearts', 'classic/queen_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('1f47d1cc-aafe-5257-a6f7-9bd014e94fc2', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'KING', 'HEARTS', 'CLASSIC_KING_HEARTS', 'King of Hearts', 'classic/king_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('fd10115d-bb10-5050-b3ee-a29dc9326e30', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'ACE', 'HEARTS', 'CLASSIC_ACE_HEARTS', 'Ace of Hearts', 'classic/ace_of_hearts.svg', 'COMMON', NULL, TRUE),
    ('58720b6e-5a08-5c09-9ddc-54689bc8d108', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SIX', 'SPADES', 'CLASSIC_SIX_SPADES', 'Six of Spades', 'classic/six_of_spades.svg', 'COMMON', NULL, TRUE),
    ('4d676a1e-2f52-59df-8c0b-84a954480891', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'SEVEN', 'SPADES', 'CLASSIC_SEVEN_SPADES', 'Seven of Spades', 'classic/seven_of_spades.svg', 'COMMON', NULL, TRUE),
    ('ca3a1464-c981-5ec8-a27b-ac22b4cd4ee2', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'EIGHT', 'SPADES', 'CLASSIC_EIGHT_SPADES', 'Eight of Spades', 'classic/eight_of_spades.svg', 'COMMON', NULL, TRUE),
    ('d33cf721-67d3-59fd-b085-1e433e7e94df', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'NINE', 'SPADES', 'CLASSIC_NINE_SPADES', 'Nine of Spades', 'classic/nine_of_spades.svg', 'COMMON', NULL, TRUE),
    ('0a480645-bdff-543e-a295-828fc29fd436', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'TEN', 'SPADES', 'CLASSIC_TEN_SPADES', 'Ten of Spades', 'classic/ten_of_spades.svg', 'COMMON', NULL, TRUE),
    ('b26c3f1a-aa8b-5a7c-8fd6-2d8ec14ae405', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'JACK', 'SPADES', 'CLASSIC_JACK_SPADES', 'Jack of Spades', 'classic/jack_of_spades.svg', 'COMMON', NULL, TRUE),
    ('89f5534a-5be4-5c61-8320-c42657691a85', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'QUEEN', 'SPADES', 'CLASSIC_QUEEN_SPADES', 'Queen of Spades', 'classic/queen_of_spades.svg', 'COMMON', NULL, TRUE),
    ('22511601-3c72-5742-980a-43dff18e8453', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'KING', 'SPADES', 'CLASSIC_KING_SPADES', 'King of Spades', 'classic/king_of_spades.svg', 'COMMON', NULL, TRUE),
    ('f42d8088-a7eb-5277-9366-0d56b0a7ac2a', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'ACE', 'SPADES', 'CLASSIC_ACE_SPADES', 'Ace of Spades', 'classic/ace_of_spades.svg', 'COMMON', NULL, TRUE);
--rollback DELETE FROM card_skin WHERE theme_id = 'dcacddbc-9f49-539c-b13b-ad1407dc03d6';

--changeset cardwar:016-seed-vanguard-skins
--comment
--comment Placeholder characters only. Skins named after real, identifiable public figures are
--comment deliberately NOT seeded until the naming and likeness question is settled separately.
INSERT INTO card_skin (id, theme_id, card_rank, card_suit, code, display_name, image_ref, rarity_code, multiplier_override, active) VALUES
    ('bc05606a-e4a5-5a70-94dc-786fb096891f', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SIX', 'CLUBS', 'VANGUARD_SIX_CLUBS', 'Thornguard Recruit', 'vanguard/thornguard_recruit.svg', 'COMMON', NULL, TRUE),
    ('7f7e9f18-bcf9-5625-9e92-13ae2a2c9dde', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SEVEN', 'CLUBS', 'VANGUARD_SEVEN_CLUBS', 'Thornguard Scout', 'vanguard/thornguard_scout.svg', 'COMMON', NULL, TRUE),
    ('ad366b2e-6c41-576d-8193-b56bef9589d4', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'EIGHT', 'CLUBS', 'VANGUARD_EIGHT_CLUBS', 'Thornguard Ranger', 'vanguard/thornguard_ranger.svg', 'COMMON', NULL, TRUE),
    ('e8521d0b-a27e-5925-951d-4fd66449856c', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'NINE', 'CLUBS', 'VANGUARD_NINE_CLUBS', 'Thornguard Sentinel', 'vanguard/thornguard_sentinel.svg', 'COMMON', NULL, TRUE),
    ('195a985c-258d-5f5d-8d66-e1c2f30c21f3', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'TEN', 'CLUBS', 'VANGUARD_TEN_CLUBS', 'Thornguard Champion', 'vanguard/thornguard_champion.svg', 'RARE', NULL, TRUE),
    ('a80cd75f-3624-5276-a9a5-fb3b4549f047', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'JACK', 'CLUBS', 'VANGUARD_JACK_CLUBS', 'Thornguard Herald', 'vanguard/thornguard_herald.svg', 'RARE', NULL, TRUE),
    ('d1925032-a2fc-5841-bf59-21046e6e7127', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'QUEEN', 'CLUBS', 'VANGUARD_QUEEN_CLUBS', 'Thornguard Matriarch', 'vanguard/thornguard_matriarch.svg', 'EPIC', NULL, TRUE),
    ('0d7d7ad4-b2df-5f27-8004-24e056e31898', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'KING', 'CLUBS', 'VANGUARD_KING_CLUBS', 'Thornguard Warden', 'vanguard/thornguard_warden.svg', 'EPIC', NULL, TRUE),
    ('5792ee0e-6ff4-5f94-bfed-195d9179d6e2', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'ACE', 'CLUBS', 'VANGUARD_ACE_CLUBS', 'Thornguard Sovereign', 'vanguard/thornguard_sovereign.svg', 'LEGENDARY', NULL, TRUE),
    ('ac0cdcfc-a824-5305-81a2-c0c1c17e462e', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SIX', 'DIAMONDS', 'VANGUARD_SIX_DIAMONDS', 'Emberhold Recruit', 'vanguard/emberhold_recruit.svg', 'COMMON', NULL, TRUE),
    ('b8bd8b08-55f0-52ad-a76b-90b594d90438', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SEVEN', 'DIAMONDS', 'VANGUARD_SEVEN_DIAMONDS', 'Emberhold Scout', 'vanguard/emberhold_scout.svg', 'COMMON', NULL, TRUE),
    ('2c8504d8-cf91-5c4b-9808-a201a371eb54', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'EIGHT', 'DIAMONDS', 'VANGUARD_EIGHT_DIAMONDS', 'Emberhold Ranger', 'vanguard/emberhold_ranger.svg', 'COMMON', NULL, TRUE),
    ('cfac97ac-831e-5166-b218-5314c0169747', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'NINE', 'DIAMONDS', 'VANGUARD_NINE_DIAMONDS', 'Emberhold Sentinel', 'vanguard/emberhold_sentinel.svg', 'COMMON', NULL, TRUE),
    ('a163b0ab-f182-5f2e-aa69-45c80f59a6b8', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'TEN', 'DIAMONDS', 'VANGUARD_TEN_DIAMONDS', 'Emberhold Champion', 'vanguard/emberhold_champion.svg', 'RARE', NULL, TRUE),
    ('aa786306-a0e1-5e3d-9ae8-a9ad179e1213', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'JACK', 'DIAMONDS', 'VANGUARD_JACK_DIAMONDS', 'Emberhold Herald', 'vanguard/emberhold_herald.svg', 'RARE', NULL, TRUE),
    ('10b0dd1b-b016-52b9-b845-c2efab4a5182', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'QUEEN', 'DIAMONDS', 'VANGUARD_QUEEN_DIAMONDS', 'Emberhold Matriarch', 'vanguard/emberhold_matriarch.svg', 'EPIC', NULL, TRUE),
    ('40ee33d3-fc35-5e29-8aed-dea01e021789', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'KING', 'DIAMONDS', 'VANGUARD_KING_DIAMONDS', 'Emberhold Warden', 'vanguard/emberhold_warden.svg', 'EPIC', NULL, TRUE),
    ('9d9e4658-8316-5dc4-b887-e4c708af6f95', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'ACE', 'DIAMONDS', 'VANGUARD_ACE_DIAMONDS', 'Emberhold Sovereign', 'vanguard/emberhold_sovereign.svg', 'LEGENDARY', NULL, TRUE),
    ('4c94033c-f341-5694-afb7-a099e5edf510', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SIX', 'HEARTS', 'VANGUARD_SIX_HEARTS', 'Tidewatch Recruit', 'vanguard/tidewatch_recruit.svg', 'COMMON', NULL, TRUE),
    ('fee8f0cc-7906-5e7a-a951-d1476f3a98ff', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SEVEN', 'HEARTS', 'VANGUARD_SEVEN_HEARTS', 'Tidewatch Scout', 'vanguard/tidewatch_scout.svg', 'COMMON', NULL, TRUE),
    ('9fed45f9-af25-52ca-8add-e82856c656e0', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'EIGHT', 'HEARTS', 'VANGUARD_EIGHT_HEARTS', 'Tidewatch Ranger', 'vanguard/tidewatch_ranger.svg', 'COMMON', NULL, TRUE),
    ('91387db9-bedd-578f-b795-9832585352ce', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'NINE', 'HEARTS', 'VANGUARD_NINE_HEARTS', 'Tidewatch Sentinel', 'vanguard/tidewatch_sentinel.svg', 'COMMON', NULL, TRUE),
    ('e825de95-9ddb-527a-ae2e-a1adc4fdcd6e', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'TEN', 'HEARTS', 'VANGUARD_TEN_HEARTS', 'Tidewatch Champion', 'vanguard/tidewatch_champion.svg', 'RARE', NULL, TRUE),
    ('4f7e9c00-4065-5f87-a6a3-a9a696f7d97a', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'JACK', 'HEARTS', 'VANGUARD_JACK_HEARTS', 'Tidewatch Herald', 'vanguard/tidewatch_herald.svg', 'RARE', NULL, TRUE),
    ('c71dedb7-341b-58e0-8903-7113433bec6c', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'QUEEN', 'HEARTS', 'VANGUARD_QUEEN_HEARTS', 'Tidewatch Matriarch', 'vanguard/tidewatch_matriarch.svg', 'EPIC', NULL, TRUE),
    ('e1bb41c7-3ba5-52f1-b8b4-9d88ba5d89f2', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'KING', 'HEARTS', 'VANGUARD_KING_HEARTS', 'Tidewatch Warden', 'vanguard/tidewatch_warden.svg', 'EPIC', NULL, TRUE),
    ('da60b9fc-af01-537a-a9b2-405e40c3ab07', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'ACE', 'HEARTS', 'VANGUARD_ACE_HEARTS', 'Tidewatch Sovereign', 'vanguard/tidewatch_sovereign.svg', 'LEGENDARY', NULL, TRUE),
    ('0fa9524c-4ffc-5628-bf24-997c7bd21483', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SIX', 'SPADES', 'VANGUARD_SIX_SPADES', 'Ironvale Recruit', 'vanguard/ironvale_recruit.svg', 'COMMON', NULL, TRUE),
    ('d7977179-a7c1-5c04-abd7-95582756b183', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'SEVEN', 'SPADES', 'VANGUARD_SEVEN_SPADES', 'Ironvale Scout', 'vanguard/ironvale_scout.svg', 'COMMON', NULL, TRUE),
    ('6a6c7487-d812-556b-8611-4ce3a3aef116', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'EIGHT', 'SPADES', 'VANGUARD_EIGHT_SPADES', 'Ironvale Ranger', 'vanguard/ironvale_ranger.svg', 'COMMON', NULL, TRUE),
    ('4b615ca4-badd-5214-b29f-5d7699b10960', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'NINE', 'SPADES', 'VANGUARD_NINE_SPADES', 'Ironvale Sentinel', 'vanguard/ironvale_sentinel.svg', 'COMMON', NULL, TRUE),
    ('11e582b5-8b6c-5939-bc33-f8c40cef8946', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'TEN', 'SPADES', 'VANGUARD_TEN_SPADES', 'Ironvale Champion', 'vanguard/ironvale_champion.svg', 'RARE', NULL, TRUE),
    ('3fa00c88-ef96-5f39-885a-635748017921', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'JACK', 'SPADES', 'VANGUARD_JACK_SPADES', 'Ironvale Herald', 'vanguard/ironvale_herald.svg', 'RARE', NULL, TRUE),
    ('c20841ec-5274-52f3-86f6-20460dafbad0', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'QUEEN', 'SPADES', 'VANGUARD_QUEEN_SPADES', 'Ironvale Matriarch', 'vanguard/ironvale_matriarch.svg', 'EPIC', NULL, TRUE),
    ('7dbd9fd1-7651-59e6-ba99-03617524def9', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'KING', 'SPADES', 'VANGUARD_KING_SPADES', 'Ironvale Warden', 'vanguard/ironvale_warden.svg', 'EPIC', NULL, TRUE),
    ('373116c7-ba56-50e8-8d31-288f2303fe26', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'ACE', 'SPADES', 'VANGUARD_ACE_SPADES', 'Ironvale Sovereign', 'vanguard/ironvale_sovereign.svg', 'LEGENDARY', 7.50, TRUE);
--rollback DELETE FROM card_skin WHERE theme_id = 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236';

--changeset cardwar:017-seed-unlock-rules
--comment One rule of each type, so every grant source has real data behind it from day one.
INSERT INTO unlock_rule (id, target_type, target_id, rule_type, threshold, price, currency) VALUES
    ('710c27a6-8071-54db-a245-e7bd9034ee34', 'THEME', 'dcacddbc-9f49-539c-b13b-ad1407dc03d6', 'FREE', NULL, NULL, NULL),
    ('57c2b980-1bac-5b70-90d8-46b9c1c3dfe9', 'THEME', 'a6f01eaf-0a83-5f44-a5e9-7733d81b6236', 'PROGRESS', 10, NULL, NULL),
    ('dcfe2068-92de-559f-9a99-212824a96318', 'SKIN', '373116c7-ba56-50e8-8d31-288f2303fe26', 'CURRENCY', NULL, 500, 'COINS'),
    ('330a1667-6dd8-5816-a54d-0383005f5a0b', 'SKIN', '9d9e4658-8316-5dc4-b887-e4c708af6f95', 'PURCHASE', NULL, 199, 'STARS');
--rollback DELETE FROM unlock_rule;
