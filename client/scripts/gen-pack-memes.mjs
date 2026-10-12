#!/usr/bin/env node
/**
 * Generates the `memes-demo` content pack: 36 placeholder faces (a colour and a generic meme title per tag, the
 * rank and suit large enough to play by), a back, two synthesized sounds and the manifest with four rules that
 * exercise every effect type, the spoken line included. The titles are deliberately generic roles, never real people; the owner replaces
 * faces and titles with real content later. The output is committed, like the classic deck.
 *
 *   npm run gen:pack:memes
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { env, render, sine, wav } from './lib/wav.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'packs', 'memes-demo');
const W = 240;
const H = 336;

/** One meme role per rank: [rank, label, tag, title, colour]. */
const ROLES = [
    ['SIX', '6', 'cat', 'Кіт', '#ef6c00'],
    ['SEVEN', '7', 'neighbour', 'Сусід', '#00838f'],
    ['EIGHT', '8', 'student', 'Студент', '#1565c0'],
    ['NINE', '9', 'granny', 'Бабуся', '#8d6e63'],
    ['TEN', '10', 'taxi', 'Таксист', '#f9a825'],
    ['JACK', 'J', 'rapstar', 'Реп-зірка', '#6a1b9a'],
    ['QUEEN', 'Q', 'blogger', 'Блогерка', '#ad1457'],
    ['KING', 'K', 'deputy', 'Депутат', '#455a64'],
    ['ACE', 'A', 'banker', 'Банкір', '#2e7d32'],
];
const SUITS = {
    CLUBS: { glyph: '♣', colour: '#1d1d24' },
    DIAMONDS: { glyph: '♦', colour: '#c62828' },
    HEARTS: { glyph: '♥', colour: '#c62828' },
    SPADES: { glyph: '♠', colour: '#1d1d24' },
};
const FONT = "font-family=\"'Trebuchet MS', 'Segoe UI', sans-serif\"";

function face(label, suit, title, colour) {
    const { glyph, colour: ink } = SUITS[suit];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="18" fill="#ffffff" stroke="#b9bcc6" stroke-width="3"/>
<rect x="18" y="64" width="${W - 36}" height="${H - 128}" rx="12" fill="${colour}"/>
<circle cx="${W / 2}" cy="150" r="46" fill="#ffffff" fill-opacity="0.25"/>
<text x="${W / 2}" y="172" text-anchor="middle" ${FONT} font-weight="700" font-size="64" fill="#ffffff">${glyph}</text>
<text x="${W / 2}" y="238" text-anchor="middle" ${FONT} font-weight="700" font-size="26" fill="#ffffff">${title}</text>
<g fill="${ink}" ${FONT} font-weight="700">
<text x="30" y="46" text-anchor="middle" font-size="${label.length > 1 ? 34 : 40}">${label}</text>
<text x="${W - 30}" y="46" text-anchor="middle" font-size="34">${glyph}</text>
<g transform="rotate(180 ${W / 2} ${H / 2})">
<text x="30" y="46" text-anchor="middle" font-size="${label.length > 1 ? 34 : 40}">${label}</text>
<text x="${W - 30}" y="46" text-anchor="middle" font-size="34">${glyph}</text>
</g>
</g>
</svg>
`;
}

function back() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
<rect width="24" height="24" fill="#ff7043"/><circle cx="12" cy="12" r="5" fill="#ffca28"/>
</pattern>
</defs>
<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="18" fill="#ffffff" stroke="#b9bcc6" stroke-width="3"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="10" fill="url(#dots)"/>
<text x="${W / 2}" y="${H / 2 + 14}" text-anchor="middle" ${FONT} font-weight="700" font-size="40" fill="#ffffff" stroke="#bf360c" stroke-width="2">МЕМ</text>
</svg>
`;
}

const SOUNDS = {
    // A sad trombone: a sliding "wah-wah" falling from 392 to 196 Hz with vibrato.
    lose_money: render(1.1, (t, p) => {
        const step = Math.min(3, Math.floor(p * 4));
        const f = [392, 370, 349, 196 + 30 * Math.sin(2 * Math.PI * 6 * t)][step];
        const tone = sine(t, f) * 0.6 + sine(t, 2 * f) * 0.25 + sine(t, 3 * f) * 0.1;
        return tone * env((p * 4) % 1, 0.05, 0.25) * 0.45;
    }),
    // A short fanfare: G, C, E, G with brassy harmonics.
    fanfare: render(0.8, (t, p) => {
        const step = Math.min(3, Math.floor(p * 4));
        const f = [392, 523, 659, 784][step];
        const tone = sine(t, f) * 0.6 + sine(t, 2 * f) * 0.3 + sine(t, 3 * f) * 0.15;
        return tone * env((p * 4) % 1, 0.03, step === 3 ? 0.15 : 0.35) * 0.4;
    }),
};

const STICKY = ['KING_OF_SPADES', 'JACK_OF_SPADES'];

const manifest = {
    id: 'memes-demo',
    version: 1,
    type: 'DECK',
    name: { uk: 'Мемна колода (демо)' },
    back: 'cards/back.svg',
    styles: 'anim/fx.css',
    cards: {},
    sounds: Object.fromEntries(Object.keys(SOUNDS).map((name) => [name, `sounds/${name}.wav`])),
    animations: { money_rain: { kind: 'css', className: 'fx-money-rain', durationMs: 1200 } },
    rules: [
        {
            id: 'banker-beaten',
            on: 'card_beaten',
            if: { beaten: { tag: 'banker' } },
            do: [
                { sound: 'lose_money' },
                { anim: 'money_rain', target: 'beaten' },
                { bubble: { uk: 'Мінус гроші!' }, target: 'beaten' },
            ],
            cooldownMs: 4000,
        },
        {
            id: 'inseparable',
            on: 'hand_changed',
            if: { handHas: STICKY },
            do: [{ layout: 'stick_together', cards: STICKY }],
        },
        {
            id: 'deputy-promises',
            on: 'card_played',
            if: { side: 'opponent', card: { tag: 'deputy' } },
            do: [
                { anim: 'shake', target: 'played' },
                { bubble: { uk: 'Обіцяю, що це востаннє!' }, target: 'opponent' },
            ],
            cooldownMs: 6000,
        },
        {
            id: 'victory-fanfare',
            on: 'duel_finished',
            if: { outcome: 'WON' },
            do: [{ sound: 'fanfare' }, { haptic: 'success' }, { say: { uk: 'Перемога!' } }],
        },
    ],
};

mkdirSync(join(OUT, 'cards'), { recursive: true });
mkdirSync(join(OUT, 'sounds'), { recursive: true });
for (const suit of Object.keys(SUITS)) {
    for (const [rank, label, tag, title, colour] of ROLES) {
        const id = `${rank}_OF_${suit}`;
        writeFileSync(join(OUT, 'cards', `${id}.svg`), face(label, suit, title, colour));
        manifest.cards[id] = { image: `cards/${id}.svg`, title: { uk: title }, tags: [tag] };
    }
}
writeFileSync(join(OUT, 'cards', 'back.svg'), back());
for (const [name, samples] of Object.entries(SOUNDS)) {
    writeFileSync(join(OUT, 'sounds', `${name}.wav`), wav(samples));
}
const file = join(OUT, 'pack.json');
const options = { ...(await prettier.resolveConfig(file)), parser: 'json' };
writeFileSync(file, await prettier.format(JSON.stringify(manifest), options));
console.log(`Wrote memes-demo: ${Object.keys(manifest.cards).length} faces, a back, sounds and pack.json`);
