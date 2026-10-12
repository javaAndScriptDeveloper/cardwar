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

### Requirement: Earned items
An item with `unlock_kind = WIN_STREAK` SHALL cost nothing and SHALL never be sold: buying it is 400 `NOT_FOR_SALE`.
`GET /shop` SHALL grant it (`owned_item.source = STREAK`) the first time the caller's best win streak, read through
the `StreakSource` port, reaches `unlock_value`, and SHALL never grant it twice. Its view SHALL carry
`unlock: { kind: "WIN_STREAK", value, met }`; an item coins simply buy carries no `unlock`.

#### Scenario: Streak reached between visits
- **WHEN** a player whose best win streak is 3 opens the shop
- **THEN** `deck-blogery` is owned, with `unlock.met = true`, and a second visit changes nothing

### Requirement: Weekly drops
An item with a `drop_slot` (0..3) SHALL be on sale only in weeks whose ISO week number, taken in `Europe/Kyiv`,
equals the slot modulo 4. In its week the view SHALL carry `unlock: { kind: "DROP", value: slot, met: true }` and
`availableUntil`, the instant of the next Monday 00:00 in Kyiv; `ShopView.drops` SHALL list exactly the items on
sale. Outside its week the item SHALL be shown with `met: false`, no `availableUntil`, and buying it SHALL be 400
`NOT_ON_SALE`. The server decides; the client only counts down.

#### Scenario: Week with a daylight-saving change
- **WHEN** the shop is read on Saturday 2027-03-27 (ISO week 12, Kyiv moves to summer time the next morning)
- **THEN** `back-bavovna` (slot 0) is on sale until `2027-03-28T21:00:00Z`, which is Monday 00:00 EEST

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
