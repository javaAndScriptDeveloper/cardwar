/**
 * «Блогери і медіа (сатира)»: nine media figures as poster cards, one per rank, with a quote per suit in the
 * deadpan register of the «Smak» channel: parody of public conduct, obviously made up, never presented as news.
 * Within the boundaries of docs/superpowers/specs/2026-10-13-popular-polish-design.md §2. The quotes are the
 * product; everything else here is plumbing for scripts/gen-pack-satire.mjs.
 */
import { FONT, H, W, frame } from '../lib/poster.mjs';
import { env, noiseSource, render, sine } from '../lib/wav.mjs';

const personas = [
    {
        rank: 'SIX',
        name: 'Лачен',
        role: 'пише',
        emoji: '✍️',
        colour: '#283593',
        tag: 'lachen',
        look: { hair: 'short', glasses: 'round', clothes: 'hoodie' },
        quotes: {
            CLUBS: 'Лачен пише… І дописати не може.',
            DIAMONDS: 'Терміново: нічого не сталося. Деталі далі.',
            HEARTS: 'Мем вийшов раніше за новину. Як завжди.',
            SPADES: 'Джерело: один надійний чат.',
        },
    },
    {
        rank: 'SEVEN',
        name: 'Раміна',
        role: 'контент',
        emoji: '🎙️',
        colour: '#ad1457',
        tag: 'ramina',
        look: { hair: 'long', hairColour: '#2a1a12', clothes: 'dress' },
        quotes: {
            CLUBS: 'Це мій контент. І ваша карта — теж.',
            DIAMONDS: "Інтерв'ю на три години. Питання — одне.",
            HEARTS: 'Усміхаюсь. Монтаж вирішить решту.',
            SPADES: 'Підпишись, інакше хід не зарахується.',
        },
    },
    {
        rank: 'EIGHT',
        name: 'Дурнєв',
        role: 'дивиться',
        emoji: '👀',
        colour: '#4527a0',
        tag: 'durnev',
        look: { hair: 'short', glasses: 'square', clothes: 'hoodie' },
        quotes: {
            CLUBS: 'Дурнєв дивиться на тебе. Не моргай.',
            DIAMONDS: 'Плюс один. Мінус карта.',
            HEARTS: 'Я це бачив у тіктоку. Там було гірше.',
            SPADES: 'Коментар під коментарем. Хід під ходом.',
        },
    },
    {
        rank: 'NINE',
        name: 'Стерненко',
        role: 'дрони',
        emoji: '🛸',
        colour: '#00695c',
        tag: 'sternenko',
        look: { hair: 'short', beard: 'full', clothes: 'tee' },
        quotes: {
            CLUBS: 'Дрони вже летять. Карта — вслід.',
            DIAMONDS: 'Збір на цей хід закрив ще вчора.',
            HEARTS: 'Дякую за донат. Тепер твій хід.',
            SPADES: 'Тиша. Це теж частина плану.',
        },
    },
    {
        rank: 'TEN',
        name: 'Притула',
        role: 'збір',
        emoji: '🫙',
        colour: '#ef6c00',
        tag: 'prytula',
        look: { hair: 'short', beard: 'full', clothes: 'tee' },
        quotes: {
            CLUBS: 'Збір закрито за дві години. Знову.',
            DIAMONDS: 'Друзі, ми це зробили. Що саме — потім.',
            HEARTS: 'Оголошую збір на ваш програш.',
            SPADES: 'Банка вже повна. Карта — ні.',
        },
    },
    {
        rank: 'JACK',
        name: 'MC Петя',
        role: 'реп',
        emoji: '🎧',
        colour: '#212121',
        tag: 'petya',
        look: { hair: 'curly', glasses: 'sun', clothes: 'hoodie' },
        quotes: {
            CLUBS: 'Йоу. Це був хід. Йоу.',
            DIAMONDS: 'Рима на карту: карта.',
            HEARTS: 'Біт качає. Козир — ні.',
            SPADES: 'Респект столу. Хід — за мною.',
        },
    },
    {
        rank: 'QUEEN',
        name: 'Леся Нікітюк',
        role: 'хто зверху',
        emoji: '📺',
        colour: '#c62828',
        tag: 'nikitiuk',
        look: { hair: 'bob', hairColour: '#2a1a12', clothes: 'dress' },
        quotes: {
            CLUBS: 'Хто зверху? Поки що не ти.',
            DIAMONDS: 'Орел чи решка? Карта!',
            HEARTS: 'Усміхнись, тебе побили в ефірі.',
            SPADES: 'Де мій дубль? Я ще не договорила.',
        },
    },
    {
        rank: 'KING',
        name: 'Гороховський',
        role: 'банк',
        emoji: '🐈',
        colour: '#37474f',
        tag: 'horokhovskyi',
        look: { hair: 'short', glasses: 'round', clothes: 'suit' },
        // Owner's art direction for the painted portrait (art/lora): a heroic goblin, short snub nose, no gold hoard.
        art: 'a strong, confident green goblin warrior-banker with a short snub nose and a sharp grin, muscular, in a sleek black suit jacket over leather armour, a small black cat with white paws sitting on his shoulder, a plate of fresh yellow lemons in the foreground',
        quotes: {
            CLUBS: 'Мінус гроші. Плюс досвід.',
            DIAMONDS: 'Кіт схвалив. Кешбек — ні.',
            HEARTS: 'Розіграш: програєш — виграєш.',
            SPADES: 'Банк у телефоні. Карта — на столі.',
        },
    },
    {
        rank: 'ACE',
        name: 'Усик',
        role: "I'm very feel",
        emoji: '🥇',
        colour: '#f9a825',
        tag: 'usyk',
        look: { hair: 'buzz', beard: 'full', clothes: 'tee' },
        quotes: {
            CLUBS: "I'm feel. I'm very feel.",
            DIAMONDS: 'Не пушай коней. Пушай карти.',
            HEARTS: 'Танцюю. Це теж захист.',
            SPADES: 'Чемпіон не ходить. Чемпіон відбивається.',
        },
    },
];

/** Black with a neon «LIVE» badge and a recording dot; the glow is an SVG filter, no external assets. */
function back() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
<feGaussianBlur stdDeviation="4" result="blur"/>
<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
<rect width="4" height="2" fill="#ffffff" fill-opacity="0.05"/>
</pattern>
</defs>
${frame()}
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="#0a0a0f"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="url(#scan)"/>
<g filter="url(#glow)">
<rect x="52" y="${H / 2 - 34}" width="136" height="68" rx="14" fill="none" stroke="#ff2d55" stroke-width="4"/>
<circle cx="78" cy="${H / 2}" r="8" fill="#ff2d55"/>
<text x="138" y="${H / 2 + 12}" text-anchor="middle" ${FONT} font-weight="700" font-size="34" letter-spacing="3" fill="#ff2d55">LIVE</text>
</g>
<text x="${W / 2}" y="${H / 2 + 60}" text-anchor="middle" ${FONT} font-size="12" letter-spacing="4" fill="#5ee7ff">● ON AIR</text>
<text x="${W / 2}" y="${H - 42}" text-anchor="middle" ${FONT} font-weight="700" font-size="13" letter-spacing="2" fill="#ff2d55">САТИРА</text>
</svg>
`;
}

/* Money falls off a beaten banker; coins jump when a fundraiser closes. */
const styles = `/* Classes named by this pack's css animations; the runtime adds one to the target for its durationMs. */
.fx-money-rain {
    position: relative;
    animation: fx-money-glow 1200ms ease-out;
}

.fx-money-rain::after {
    content: '💸 💵 💸';
    position: absolute;
    left: 0;
    right: 0;
    top: -1.2em;
    text-align: center;
    font-size: 20px;
    pointer-events: none;
    animation: fx-money-fall 1200ms ease-in forwards;
}

.fx-coins {
    position: relative;
}

.fx-coins::after {
    content: '🪙 🪙 🪙';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    text-align: center;
    font-size: 20px;
    pointer-events: none;
    animation: fx-coins-rise 1000ms ease-out forwards;
}

@keyframes fx-money-glow {
    0% {
        filter: drop-shadow(0 0 0 rgb(46 125 50 / 0%));
    }
    30% {
        filter: drop-shadow(0 0 14px rgb(46 125 50 / 90%));
        transform: scale(1.06);
    }
    100% {
        filter: drop-shadow(0 0 0 rgb(46 125 50 / 0%));
        transform: scale(1);
    }
}

@keyframes fx-money-fall {
    from {
        transform: translateY(0);
        opacity: 1;
    }
    to {
        transform: translateY(140px);
        opacity: 0;
    }
}

@keyframes fx-coins-rise {
    0% {
        transform: translateY(0) scale(0.6);
        opacity: 0;
    }
    30% {
        opacity: 1;
    }
    100% {
        transform: translateY(-120px) scale(1.1);
        opacity: 0;
    }
}
`;

const noise = noiseSource(23);
/* Listed with the demo first: the shop plays `lose_money` when the deck's preview is tapped. */
const sounds = {
    // A cash register: a mechanical click, then the bell.
    lose_money: render(0.9, (t, p) => {
        const click = t < 0.06 ? noise() * env(t / 0.06, 0.05, 0.8) * 0.5 : 0;
        const bellT = Math.max(0, t - 0.08);
        const bell =
            t < 0.08
                ? 0
                : (sine(bellT, 2093) * 0.5 + sine(bellT, 2637) * 0.35 + sine(bellT, 3136) * 0.15) *
                  Math.exp(-bellT * 4) *
                  0.45;
        void p;
        return click + bell;
    }),
    // A beatbox bar: kick, hat, snare, hat, kick, kick, snare, hat.
    beatbox: render(1.2, (t) => {
        const step = Math.min(7, Math.floor(t / 0.15));
        const local = (t % 0.15) / 0.15;
        const kick = [1, 0, 0, 0, 1, 1, 0, 0][step]
            ? sine(t, 150 - 110 * local) * env(local, 0.005, 0.5) * 0.9
            : 0;
        const snare = [0, 0, 1, 0, 0, 0, 1, 0][step]
            ? (noise() * 0.7 + sine(t, 180) * 0.3) * env(local, 0.005, 0.7) * 0.6
            : 0;
        const hat = noise() * env(local, 0.002, 1.2) * 0.12;
        return kick + snare + hat;
    }),
    // Applause: noise shaped by many small bursts, swelling and fading.
    applause: render(1.4, (t, p) => {
        const burst = Math.pow(
            Math.abs(Math.sin(2 * Math.PI * 13 * t) * Math.sin(2 * Math.PI * 7.3 * t)),
            1.5,
        );
        return noise() * (0.35 + 0.65 * burst) * Math.sin(Math.PI * p) * 0.4;
    }),
    // A whoosh: noise rising and falling under a sweeping tone.
    whoosh: render(0.5, (t, p) => {
        const sweep = 0.5 + 0.5 * sine(t, 60 + 900 * p);
        return noise() * sweep * Math.sin(Math.PI * p) * 0.45;
    }),
};

const animations = {
    money_rain: { kind: 'css', className: 'fx-money-rain', durationMs: 1200 },
    coins: { kind: 'css', className: 'fx-coins', durationMs: 1000 },
};

const played = (tag, side) => ({ on: 'card_played', if: side ? { side, card: { tag } } : { card: { tag } } });
const beaten = (tag) => ({ on: 'card_beaten', if: { beaten: { tag } } });
const beats = (tag) => ({ on: 'card_beaten', if: { card: { tag } } });

const rules = [
    // The two fundraisers are not seen apart, on any suit.
    ...['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'].map((suit) => {
        const cards = [`TEN_OF_${suit}`, `NINE_OF_${suit}`];
        return {
            id: `fund-duo-${suit.toLowerCase()}`,
            on: 'hand_changed',
            if: { handHas: cards },
            do: [{ layout: 'stick_together', cards }],
        };
    }),
    {
        id: 'horokhovskyi-beaten',
        ...beaten('horokhovskyi'),
        do: [
            { sound: 'lose_money' },
            { anim: 'money_rain', target: 'beaten' },
            { say: { uk: 'Мінус гроші' }, pitch: 0.8 },
        ],
        cooldownMs: 4000,
    },
    {
        id: 'petya-beats',
        ...beats('petya'),
        do: [{ sound: 'beatbox' }, { anim: 'pulse', target: 'defence' }, { say: { uk: 'Йоу' }, rate: 1.2 }],
        cooldownMs: 4000,
    },
    {
        id: 'durnev-played',
        ...played('durnev', 'opponent'),
        do: [{ bubble: { uk: 'Дурнєв дивиться на тебе' }, target: 'you' }],
        cooldownMs: 6000,
    },
    {
        id: 'prytula-played',
        ...played('prytula'),
        do: [
            { bubble: { uk: 'Збір закрито за дві години' }, target: 'played' },
            { anim: 'coins', target: 'played' },
        ],
        cooldownMs: 6000,
    },
    {
        id: 'sternenko-played',
        ...played('sternenko'),
        do: [{ sound: 'whoosh' }, { bubble: { uk: 'Дрони вже летять' }, target: 'played' }],
        cooldownMs: 6000,
    },
    {
        id: 'ramina-played',
        ...played('ramina'),
        do: [{ bubble: { uk: 'Це мій контент' }, target: 'played' }],
        cooldownMs: 6000,
    },
    {
        id: 'lachen-beaten',
        ...beaten('lachen'),
        do: [{ bubble: { uk: 'Лачен пише…' }, target: 'beaten' }],
        cooldownMs: 6000,
    },
    {
        id: 'usyk-beats',
        ...beats('usyk'),
        do: [{ say: { uk: "I'm feel, I'm very feel" }, rate: 0.9 }, { haptic: 'success' }],
        cooldownMs: 6000,
    },
    {
        id: 'nikitiuk-played',
        ...played('nikitiuk'),
        do: [{ bubble: { uk: 'Хто зверху?' }, target: 'played' }],
        cooldownMs: 6000,
    },
    {
        id: 'won',
        on: 'duel_finished',
        if: { outcome: 'WON' },
        do: [{ sound: 'applause' }, { say: { uk: 'Контент вдався. Підписуйтесь' } }, { haptic: 'success' }],
    },
    {
        id: 'lost',
        on: 'duel_finished',
        if: { outcome: 'LOST' },
        do: [{ bubble: { uk: 'Оголошую збір на реванш' }, target: 'table' }],
    },
];

export default {
    id: 'blogery',
    name: 'Блогери і медіа (сатира)',
    personas,
    back,
    styles,
    sounds,
    animations,
    rules,
};
