# Monetization model

Written 2026-10-16 for milestone «MVP 14: Monetization» (issues #98–#102). Every number here is an assumption to be
replaced by measurement; the formulas are the part that stays. Plug your own inputs with the snippet in §5.

## 1. What a sale is worth

Telegram Stars: the player pays about $0.02 per Star in-app; after Telegram and the app stores the developer
withdraws about **$0.013 per Star** through Fragment (TON). Use `NET_PER_STAR = 0.013`.

| Coin pack (`shop/spec.md`) | Coins | Stars | Net to us | Net per 1000 coins |
|---|---|---|---|---|
| Small | 1 000 | 50 | $0.65 | $0.65 |
| Medium | 5 500 | 250 | $3.25 | $0.59 |
| Big | 12 000 | 500 | $6.50 | $0.54 |

Coin prices in dollars (small-pack rate): deck 1 000–1 500 → $0.65–1.00; card back 300–500 → $0.20–0.33; table
500–700; frame 600–800; booster 250 → $0.16; a deck completed through singles (#93: 20×40 + 12×90 + 4×150 = 2 480)
→ $1.60. The whole catalog as of 2026-10 is about **9 000 coins ≈ $6** per player if every coin were bought.

## 2. The faucet problem

Free coins per retained player (`wallet/spec.md`, `player-account/spec.md`):

| Source | Amount |
|---|---|
| Starter | 500 once |
| Daily bonus | 50, 75, 100, 150, 200, 300, then **500 every day** from day 7 |
| Missions | roughly 100–200 a day |
| Staked duels | zero-sum between players |

A player who shows up daily earns ~4 500 coins a week from day 7 on: the full catalog in a fortnight, a deck every
two or three days. Coin packs then only sell impatience. Issue #99 cuts the faucet (starter 300, bonus capped at
200, missions capped at 150 a day → ~2 400 a week, still a cosmetic every few days); issue #98 moves the unique
assets (likeness satire decks) to Stars only, where no faucet reaches them.

## 3. Revenue formula

```
DAU            = MAU × dau_ratio                       (casual Telegram games: 0.15–0.25)
payers         = MAU × conversion                      (1–3 %; 3 % needs §2 fixed and Stars-only items)
stars_revenue  = payers × ARPPU                         (ARPPU $4–6: mostly small packs, some medium, a deck)
ad_revenue     = DAU × 30 × views_per_dau × eCPM / 1000 (rewarded video, 1 view a day, eCPM $1–2 in UA)
revenue        = stars_revenue + ad_revenue
net            = revenue × (1 − tax) − infra            (ФОП 3 група 5 % + ~2 % TON→UAH spread; infra €4–8)
```

## 4. Scenarios (monthly)

Baseline: `dau_ratio 0.20`, `conversion 1.5 %`, `ARPPU $4`, `views 1`, `eCPM $1.5`.

| MAU | Payers | Stars | Ads | Revenue | Net (−7 %, −€8) |
|---|---|---|---|---|---|
| 1 000 | 15 | $60 | $9 | $69 | ~$56 |
| 10 000 | 150 | $600 | $90 | $690 | ~$633 |
| 100 000 | 1 500 | $6 000 | $900 | $6 900 | ~$6 410 |

After #98 + #99 (`conversion 3 %`, `ARPPU $6`):

| MAU | Payers | Stars | Ads | Revenue |
|---|---|---|---|---|
| 1 000 | 30 | $180 | $9 | $189 |
| 10 000 | 300 | $1 800 | $90 | $1 890 |
| 100 000 | 3 000 | $18 000 | $900 | $18 900 |

Infra breaks even at about 100 MAU; everything above that is acquisition. One post to a 100k-subscriber channel is
worth roughly 5 000 opens and, at 10 % day-30 retention, ~500 MAU. Paid Telegram ads in Ukraine run about $1–2 per
install, so an install has to return >$2 over its life: at $6 ARPPU and 3 % conversion that is $0.18 per install
from Stars, meaning paid acquisition does not pay until ARPPU or conversion is several times higher. Organic and
gifting (#100) first.

## 5. Plug your own numbers

```bash
node -e '
const [mau, conv, arppu, dau, views, ecpm] = process.argv.slice(1).map(Number);
const payers = mau * conv, stars = payers * arppu, ads = mau * dau * 30 * views * ecpm / 1000;
console.log({ payers, stars: +stars.toFixed(0), ads: +ads.toFixed(0), revenue: +(stars + ads).toFixed(0) });
' 10000 0.015 4 0.20 1 1.5
```

Arguments: MAU, conversion, ARPPU, DAU ratio, ad views per DAU per day, eCPM.

## 6. Levers, in order of expected effect

1. **Stars-only premium decks** (#98): the likeness decks are the asset; 120–150⭐ ($1.6–2.0 net).
2. **Cut the faucet** (#99): coins stay worth something.
3. **Boosters over singles** (#93): random, no duplicates, completing by boosters ≈ 2× the deck.
4. **Gifting** (#100): the payer brings the next player.
5. **Rewarded ad** (#101): revenue from the 97 % who never pay.
6. **Season pass** (#102): recurring, after a month of data.

## 7. Costs that are not in the formula

- Art: GPU one-off $15–30 per 18–36 personas (`art/lora/README.md`); FLUX.1-dev commercial licence or a swap to an
  Apache-2.0 model before the first paid likeness deck; one IP lawyer hour.
- Server: Hetzner CX22 €4–8 a month; the current stack holds thousands of MAU without change.
- Your time on photos, posts and support; the largest line by far.
