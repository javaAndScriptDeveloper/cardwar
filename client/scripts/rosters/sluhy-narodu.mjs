/**
 * «Слуги народу (сатира)»: nine public figures as poster cards, one per rank, with a quote per suit in the deadpan
 * register of the «Smak» channel: parody of public conduct, obviously made up, never presented as news. Within
 * the boundaries of docs/superpowers/specs/2026-10-13-popular-polish-design.md §2. The quotes are the product;
 * everything else here is plumbing for scripts/gen-pack-satire.mjs.
 */
import { FONT, H, W, frame } from '../lib/poster.mjs';
import { env, noiseSource, render, sine } from '../lib/wav.mjs';

const personas = [
    {
        rank: 'SIX',
        name: 'Безугла',
        role: 'народна депутатка',
        emoji: '📱',
        colour: '#7b1fa2',
        tag: 'bezuhla',
        art: "a provocative late-night queen of the parliament in a dramatic red gown with a jagged golden crown, smoky eye make-up and glossy lips, raising a glowing phone like a weapon at three in the morning, a crescent moon and a clock behind her, torn general's epaulettes scattered at her feet, bold confident smirk",
        altArt: 'in a grey hoodie at three in the morning, face lit by a laptop, energy drink cans around her, posts flying out as paper planes',
        look: { hair: 'long', hairColour: '#6b4a2b', clothes: 'suit' },
        quotes: {
            CLUBS: 'Вимагаю звільнити цю карту. І наступну теж.',
            DIAMONDS: 'Пост о третій ночі. Тема: винні всі.',
            HEARTS: 'Відкрила фейсбук — закрила дискусію.',
            SPADES: 'Я не критикую. Я констатую. Голосно.',
        },
    },
    {
        rank: 'SEVEN',
        name: 'Арахамія',
        role: 'голова фракції',
        emoji: '🤝',
        colour: '#00796b',
        tag: 'arakhamia',
        look: { hair: 'short', beard: 'full', clothes: 'suit' },
        quotes: {
            CLUBS: 'Це був ситуативний союз із вашою картою.',
            DIAMONDS: 'Монобільшість — це коли більшість моно.',
            HEARTS: 'Домовились. Про що — скажу пізніше.',
            SPADES: 'Голосуємо за. Потім прочитаємо.',
        },
    },
    {
        rank: 'EIGHT',
        name: 'Гончаренко',
        role: 'термінове звернення',
        emoji: '⚡',
        colour: '#e65100',
        tag: 'honcharenko',
        art: 'a hyperactive parliament streamer gripping a selfie stick and three ringing phones, a red flashing emergency siren strapped to his head, mouth open mid-urgent-announcement, notification icons swarming around him like bees, parliament chamber benches behind him',
        altArt: 'sprinting out of the parliament doors with a phone held high, a trail of notification bubbles behind him, tie flying over his shoulder',
        look: { hair: 'short', beard: 'stubble', clothes: 'tee' },
        quotes: {
            CLUBS: '⚡ Термінове звернення. Кінець звернення.',
            DIAMONDS: 'Знімаю тікток із засідання. Засідання — фон.',
            HEARTS: 'Я вже в ефірі. Де саме — не принципово.',
            SPADES: 'Терміново! Деталі — у наступному терміново.',
        },
    },
    {
        rank: 'NINE',
        name: 'Тимошенко',
        role: 'коса',
        emoji: '🎀',
        colour: '#c2185b',
        tag: 'tymoshenko',
        art: 'in a snow-white dress with her braid wound into a giant crown, a heart brooch, holding a gas valve wheel like a sceptre',
        altArt: 'a hard hat over the braid, white suit with sleeves rolled up, construction site at night, blueprints in hand',
        look: { hair: 'braid', hairColour: '#d9b86a', clothes: 'dress' },
        quotes: {
            CLUBS: 'Коса — сила. Решта — деталі.',
            DIAMONDS: 'Я повернулась. Я, власне, і не йшла.',
            HEARTS: 'Обіцяю знизити ціну на газ для цієї карти.',
            SPADES: 'Зачіска нова, програма та сама.',
        },
    },
    {
        rank: 'TEN',
        name: 'Кличко',
        role: 'мер',
        emoji: '🥊',
        colour: '#1565c0',
        tag: 'klychko',
        art: 'a heavyweight boxing champion in red gloves and a gold title belt, a brass Kyiv metro token on a chain round his neck, chestnut leaves and conkers swirling around him, a tangled scribble speech bubble above his puzzled face, a glass pedestrian bridge with a cracked panel and art deco facades of Khreshchatyk glowing behind him',
        altArt: 'a mayor in a tailored coat shovelling snow on Khreshchatyk, cars buried to the roof, a hard hat on his head',
        look: { hair: 'buzz', clothes: 'suit' },
        quotes: {
            CLUBS: 'Сьогодні в завтрашній день не всі можуть дивитися.',
            DIAMONDS: 'Київ готовий. До чого — уточнюємо.',
            HEARTS: 'Ми стоїмо на порозі, і він уже близько.',
            SPADES: 'Я це сказав? Значить, так і буде. Або ні.',
        },
    },
    {
        rank: 'JACK',
        name: 'Порошенко',
        role: 'армія, мова, віра',
        emoji: '🍬',
        colour: '#b71c1c',
        tag: 'poroshenko',
        art: 'a chocolate king on a cocoa throne, crown of golden candy wrappers, velvet cape trimmed with chocolate bars, a chocolate-bar sceptre, a tiny chocolate factory with smoking chimneys behind him, pralines and caramel rivers at his feet, satisfied grin',
        altArt: 'on a stadium stage on one knee with a microphone, roaring stands and floodlights behind him',
        look: { hair: 'short', hairColour: '#8a8a90', clothes: 'suit' },
        quotes: {
            CLUBS: 'Армія! Мова! Віра! Карта!',
            DIAMONDS: 'Томос на кожну карту. І цукерку.',
            HEARTS: 'Я прийшов із цукерками. І з тезами.',
            SPADES: 'Геть від Москви! І від цього ходу.',
        },
    },
    {
        rank: 'QUEEN',
        name: 'Єрмак',
        role: 'офіс',
        emoji: '🗂️',
        colour: '#37474f',
        tag: 'yermak',
        art: 'a grey eminence in a long dark overcoat, half in shadow, a red leather folder under his arm, pulling the strings of a row of tiny identical puppet officials, an untouched army helmet dangling from his elbow, dim palace corridor behind him',
        altArt: 'in brand-new spotless camouflage with a still-shiny helmet, rolling a designer suitcase onto a train platform, a shovel under his arm, soldiers staring',
        look: { hair: 'buzz', hairColour: '#6b6b70', beard: 'stubble', clothes: 'suit' },
        quotes: {
            CLUBS: 'Офіс не коментує. Офіс грає.',
            DIAMONDS: 'Мене нема на фото, але я поруч. Завжди.',
            HEARTS: 'Усі питання — через офіс. Офіс — це я.',
            SPADES: 'Хід погоджено. Ким — не уточнюється.',
        },
    },
    {
        rank: 'KING',
        name: 'Залужний',
        role: 'залізний генерал',
        emoji: '🛡️',
        colour: '#556b2f',
        tag: 'zaluzhnyi',
        look: { hair: 'buzz', clothes: 'uniform' },
        quotes: {
            CLUBS: 'Залізний. Без коментарів.',
            DIAMONDS: 'Спокійно. Я бачив гірші розклади.',
            HEARTS: "Лондон на зв'язку. Карта — теж.",
            SPADES: 'Усміхнувся. Усі зрозуміли, що це туз.',
        },
    },
    {
        rank: 'ACE',
        name: 'Зеленський',
        role: 'президент',
        emoji: '🎤',
        colour: '#1b5e20',
        tag: 'zelenskyi',
        art: 'a comedy-series president in his trademark olive khaki T-shirt with rolled sleeves, firing two uzi submachine guns with wild muzzle flashes, parliament chamber in chaos behind him, papers and chairs flying, manic grin',
        altArt: "a ballroom dancer in a shimmering black shirt mid high kick, his partner's hand in his, disco ball overhead, judges' paddles showing tens",
        look: { hair: 'short', beard: 'stubble', clothes: 'tee' },
        quotes: {
            CLUBS: 'Доброго вечора. Ми з козирями.',
            DIAMONDS: 'Я тут. І карта тут. Усі тут.',
            HEARTS: 'Дякую кожному, хто сьогодні відбився.',
            SPADES: 'Звернення коротке: цей хід — переможний.',
        },
    },
];

/** Dark blue, a repeated «СЛУГИ» monogram and a trident drawn with paths; no external assets. */
function back() {
    const trident = `<g transform="translate(76 92)" fill="#f2c14e">
<path d="M44 0 L54 20 L50 20 L50 96 L38 96 L38 20 L34 20 Z"/>
<path d="M10 10 C -4 42, 2 82, 34 100 L34 112 C -8 98, -14 42, 2 6 Z"/>
<path d="M78 10 C 92 42, 86 82, 54 100 L54 112 C 96 98, 102 42, 86 6 Z"/>
<path d="M30 112 H58 L66 128 L44 144 L22 128 Z"/>
</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<pattern id="monogram" width="64" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
<text x="2" y="24" ${FONT} font-weight="700" font-size="14" letter-spacing="2" fill="#ffffff" fill-opacity="0.12">СЛУГИ</text>
</pattern>
</defs>
${frame()}
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="#0b2a5b"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="url(#monogram)"/>
<rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="8" fill="none" stroke="#f2c14e" stroke-width="2" stroke-opacity="0.8"/>
${trident}
<text x="${W / 2}" y="${H - 42}" text-anchor="middle" ${FONT} font-weight="700" font-size="13" letter-spacing="2" fill="#f2c14e">САТИРА</text>
</svg>
`;
}

/* The felt goes dark for the rule's duration while two «windows» flicker, like a block on a generator. */
const styles = `/* Classes named by this pack's css animations; the runtime adds one to the target for its durationMs. */
.fx-blackout {
    position: relative;
    animation: fx-blackout-dim 1800ms ease-in-out;
}

.fx-blackout::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    background:
        radial-gradient(circle at 24% 38%, rgb(255 214 110 / 90%) 0 4px, transparent 6px),
        radial-gradient(circle at 76% 62%, rgb(255 214 110 / 90%) 0 4px, transparent 6px);
    animation: fx-blackout-flicker 1800ms steps(1, end);
}

@keyframes fx-blackout-dim {
    0% {
        filter: brightness(1);
    }
    15% {
        filter: brightness(0.25);
    }
    85% {
        filter: brightness(0.25);
    }
    100% {
        filter: brightness(1);
    }
}

@keyframes fx-blackout-flicker {
    0% {
        opacity: 0;
    }
    20% {
        opacity: 1;
    }
    35% {
        opacity: 0;
    }
    45% {
        opacity: 1;
    }
    60% {
        opacity: 0.3;
    }
    70% {
        opacity: 1;
    }
    85% {
        opacity: 0;
    }
}
`;

const noise = noiseSource(11);
/* Listed with the demo first: the shop plays `fanfare` when the deck's preview is tapped. */
const sounds = {
    // A brassy C-E-G-C fanfare.
    fanfare: render(1.0, (t, p) => {
        const step = Math.min(3, Math.floor(p * 4));
        const f = [523, 659, 784, 1047][step];
        const tone = sine(t, f) * 0.6 + sine(t, 2 * f) * 0.3 + sine(t, 3 * f) * 0.12;
        return tone * env((p * 4) % 1, 0.03, step === 3 ? 0.12 : 0.35) * 0.4;
    }),
    // Applause: noise shaped by many small bursts, swelling and fading.
    applause: render(1.4, (t, p) => {
        const burst = Math.pow(
            Math.abs(Math.sin(2 * Math.PI * 13 * t) * Math.sin(2 * Math.PI * 7.3 * t)),
            1.5,
        );
        return noise() * (0.35 + 0.65 * burst) * Math.sin(Math.PI * p) * 0.4;
    }),
    // A blackout: a mains hum sliding down and dying.
    blackout: render(1.2, (t, p) => {
        const f = 110 - 70 * p;
        return (
            (sine(t, f) * 0.6 + sine(t, 2 * f) * 0.25 + sine(t, 50) * 0.15 * (1 - p)) *
            env(p, 0.05, 0.25) *
            0.5
        );
    }),
    // A short bright ding.
    ding: render(0.4, (t, p) => (sine(t, 1320) * 0.7 + sine(t, 2640) * 0.2) * env(p, 0.005, 0.2) * 0.4),
};

const animations = { blackout: { kind: 'css', className: 'fx-blackout', durationMs: 1800 } };

const played = (tag, side) => ({ on: 'card_played', if: side ? { side, card: { tag } } : { card: { tag } } });
const beaten = (tag) => ({ on: 'card_beaten', if: { beaten: { tag } } });

const rules = [
    // The president and the office are not seen apart, on any suit.
    ...['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'].map((suit) => {
        const cards = [`ACE_OF_${suit}`, `QUEEN_OF_${suit}`];
        return {
            id: `inseparable-${suit.toLowerCase()}`,
            on: 'hand_changed',
            if: { handHas: cards },
            do: [{ layout: 'stick_together', cards }],
        };
    }),
    {
        id: 'klychko-beaten',
        ...beaten('klychko'),
        do: [
            { anim: 'shake', target: 'beaten' },
            { bubble: { uk: 'Сьогодні в завтрашній день не всі можуть дивитися' }, target: 'beaten' },
            { say: { uk: 'Сьогодні в завтрашній день не всі можуть дивитися' }, rate: 0.9 },
        ],
        cooldownMs: 6000,
    },
    {
        id: 'poroshenko-played',
        ...played('poroshenko', 'you'),
        do: [{ say: { uk: 'Армія! Мова! Віра!' }, rate: 1.1 }],
        cooldownMs: 6000,
    },
    {
        id: 'zelenskyi-played',
        ...played('zelenskyi', 'you'),
        do: [
            { anim: 'pulse', target: 'played' },
            { bubble: { uk: 'Вийди звідси, розбійник!' }, target: 'played' },
            { say: { uk: 'Вийди звідси, розбійник!' }, rate: 1.1 },
        ],
        cooldownMs: 6000,
    },
    {
        id: 'bezuhla-played',
        ...played('bezuhla', 'opponent'),
        do: [
            { bubble: { uk: 'Вас треба звільнити' }, target: 'you' },
            { anim: 'shake', target: 'you' },
        ],
        cooldownMs: 6000,
    },
    {
        id: 'arakhamia-beaten',
        ...beaten('arakhamia'),
        do: [{ bubble: { uk: 'Це був ситуативний союз' }, target: 'beaten' }],
        cooldownMs: 6000,
    },
    {
        id: 'honcharenko-played',
        ...played('honcharenko'),
        do: [
            { sound: 'ding' },
            { bubble: { uk: '⚡ Термінове звернення' }, target: 'played' },
            { say: { uk: 'Терміново!' }, rate: 1.3, pitch: 1.2 },
        ],
        cooldownMs: 6000,
    },
    {
        id: 'tymoshenko-played',
        ...played('tymoshenko'),
        do: [
            { anim: 'pulse', target: 'played' },
            { bubble: { uk: 'Коса — сила' }, target: 'played' },
        ],
        cooldownMs: 6000,
    },
    {
        id: 'zaluzhnyi-beats',
        on: 'card_beaten',
        if: { card: { tag: 'zaluzhnyi' } },
        do: [
            { sound: 'applause' },
            { say: { uk: 'Залізний генерал' }, rate: 0.9, pitch: 0.8 },
            { haptic: 'success' },
        ],
        cooldownMs: 6000,
    },
    {
        id: 'trump-reveal',
        on: 'duel_started',
        if: { random: 0.5 },
        do: [{ bubble: { uk: "Козир — Трамп. Перемир'я на 15 хвилин" }, target: 'table' }],
    },
    {
        id: 'blackout',
        on: 'cards_taken',
        if: { side: 'you' },
        do: [
            { sound: 'blackout' },
            { anim: 'blackout', target: 'felt' },
            { bubble: { uk: 'ДТЕК: стабілізаційне відключення' }, target: 'table' },
        ],
        cooldownMs: 8000,
    },
    {
        id: 'won',
        on: 'duel_finished',
        if: { outcome: 'WON' },
        do: [{ sound: 'fanfare' }, { say: { uk: 'Перемога! Дякую кожному' } }, { haptic: 'success' }],
    },
    {
        id: 'lost',
        on: 'duel_finished',
        if: { outcome: 'LOST' },
        do: [{ bubble: { uk: 'Все йде за планом' }, target: 'table' }],
    },
];

export default {
    id: 'sluhy-narodu',
    name: 'Слуги народу (сатира)',
    personas,
    back,
    styles,
    sounds,
    animations,
    rules,
};
