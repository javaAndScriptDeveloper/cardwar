# MVP 5: Shop, Cosmetics, Emotes & Telegram Stars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Backend first, client against the contract.

**Goal:** Players spend coins on cosmetics (decks, card backs, tables, avatar frames, emotes), equip them, throw emotes
at the table, and top up coins with Telegram Stars.

**Architecture:** In `monetization`: `shop_item` (catalog rows: code, type, contentRef, Ukrainian name, coin price,
sort), `owned_item` (player, item, source, time) and `loadout` (player, type → item). `ShopService` lists, buys (wallet
debit `PURCHASE` keyed `item:<code>`, then ownership, one transaction), equips, and answers `loadoutOf(player)`. Free
items are owned implicitly. Emotes: `POST /duels/{id}/emotes` checks participation and ownership, then publishes an
`EMOTE` duel event carrying the code and sender; the client shows it and feeds `emote_received` to the rule engine.
The opponent's card back and frame ride on `DuelView.opponentCosmetics`. Stars: `StarsService` creates an invoice
link through the Bot API (`createInvoiceLink`, currency `XTR`) with an HMAC-signed payload; the bot webhook answers
`pre_checkout_query` after verifying payload and amount, and credits the wallet on `successful_payment` (kind
`STARS_TOPUP`, reference = `telegram_payment_charge_id`, idempotent).

**Spec:** `docs/superpowers/specs/2026-10-12-mvp-design.md` §4 (Stars), §5 (shop), §7.

## Global Constraints

- Prices live server-side only; coin packs: `coins-1000` 1000/50⭐, `coins-5500` 5500/250⭐, `coins-12000` 12000/500⭐.
- A purchase is all-or-nothing; buying an owned item is 409 `ALREADY_OWNED`; equipping an unowned one 400 `NOT_OWNED`.
- Invoice payload `<playerId>.<packId>.<nonce>.<hmac>` with HMAC-SHA256 keyed by a key derived from the bot token
  (label `cardwar-invoice`); never logged. The webhook registration must include `pre_checkout_query`.
- Emotes: at most one per player per 3 s (429-free: excess is 400 `EMOTE_TOO_FAST`).
- Free defaults: deck `classic`, back `classic`, table `green`, no frame.

## API contract

```
GET  /api/v1/shop → { items: ShopItemView[], coinPacks: CoinPackView[] }
ShopItemView { code, type: 'DECK'|'CARD_BACK'|'TABLE'|'FRAME'|'EMOTE', contentRef, name, price, owned, equipped }
CoinPackView { id, coins, stars }
POST /api/v1/shop/items/{code}/buy    → ShopItemView   400 INSUFFICIENT_COINS, 409 ALREADY_OWNED, 404
POST /api/v1/shop/items/{code}/equip  → LoadoutView    400 NOT_OWNED, 400 NOT_EQUIPPABLE (emotes)
GET  /api/v1/me/loadout               → LoadoutView
LoadoutView { deck, cardBack, table, frame?, emotes: string[] }   // contentRefs; emotes = owned emote contentRefs
POST /api/v1/shop/stars/invoice { packId } → { invoiceLink }
POST /api/v1/duels/{id}/emotes { code } → 204   400 NOT_OWNED | EMOTE_TOO_FAST, 403 non-participant
SSE event on the duel stream: { type: 'EMOTE', duelId, from: playerId, emote: contentRef }
DuelView.opponentCosmetics { cardBack, frame? }
CoinKind gains 'STARS_TOPUP'
```

## Tasks

1. Changeset `010-shop.sql` (tables + seed items), entities, `ShopService` (list/buy/equip/loadout), controller, tests.
2. Emotes endpoint + event; `opponentCosmetics` on views; tests.
3. Stars: invoice link, webhook `pre_checkout_query` and `successful_payment`, idempotent credit; tests with a fake Bot
   API; `setWebhook` with the new `allowed_updates` on deploy.
4. Client: shop screen with tabs and previews, buy/equip, coin-pack tab opening `WebApp.openInvoice` and refreshing the
   wallet on `paid`; table renders the equipped table/back and the opponent's back/frame; emote tray at the table;
   incoming emote bubbles; settings deck picker replaced by the shop's equip (settings keeps it as a fallback only
   outside Telegram).
5. E2E: buy and equip a card back with starter coins, see it at the table; an emote reaches the other browser.
