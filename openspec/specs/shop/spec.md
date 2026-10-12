# Shop

## Purpose

Cosmetics bought with coins (decks, card backs, tables, avatar frames, emotes), what a player has equipped, and coin
packs bought with Telegram Stars.

## Requirements

### Requirement: Catalogue and ownership
The shop SHALL list every active item with its type, content reference, Ukrainian name, coin price, and whether the
caller owns and has equipped it. Default items SHALL be owned by everybody. Buying SHALL debit the wallet and record
ownership in one transaction; buying an owned item SHALL be 409 `ALREADY_OWNED`, an unaffordable one 400
`INSUFFICIENT_COINS`.

### Requirement: Loadout
A player SHALL equip one owned item per slot (deck, card back, table, frame); equipping an unowned item SHALL be 400
`NOT_OWNED`, and emotes are not equipped (400 `NOT_EQUIPPABLE`). The opponent's card back and frame SHALL be visible
in the duel view.

### Requirement: Emotes
A participant SHALL be able to throw an owned emote at the table at most once every 3 seconds (400 `EMOTE_TOO_FAST`);
both players SHALL receive it as an `EMOTE` event on the duel stream. A non-participant gets 403.

### Requirement: Telegram Stars coin packs
Coin packs (1000/50⭐, 5500/250⭐, 12000/500⭐) SHALL be sold through a Telegram Stars invoice whose payload is signed
with a key derived from the bot token. The bot SHALL approve a pre-checkout only for an invoice it signed, at that
pack's price, and SHALL credit the coins on a successful payment exactly once per Telegram charge id.

#### Scenario: Forged payment
- **WHEN** a payment arrives whose payload was not signed by the server
- **THEN** no coins are credited
