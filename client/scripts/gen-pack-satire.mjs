#!/usr/bin/env node
/**
 * Generates a satire content pack from its roster (scripts/rosters/<id>.mjs): 36 poster faces, a back, the
 * stylesheet, synthesized sounds and pack.json under public/packs/<id>/. The roster holds the personas, quotes,
 * rules and sound recipes; this script only renders. The output is committed, like the other packs.
 *
 *   npm run gen:pack:satire -- sluhy-narodu
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { BEARD, CLOTHES, GLASSES, HAIR, RANKS, SUITS, face } from './lib/poster.mjs';
import { wav } from './lib/wav.mjs';

const id = process.argv[2];
if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    console.error('usage: gen-pack-satire.mjs <pack id>');
    process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const roster = (await import(`./rosters/${id}.mjs`)).default;
if (roster.id !== id) {
    throw new Error(`roster ${id} declares id "${roster.id}"`);
}
const OUT = join(here, '..', 'public', 'packs', id);

const LOOKS = { hair: HAIR, beard: BEARD, glasses: GLASSES, clothes: CLOTHES };
for (const persona of roster.personas) {
    for (const [field, allowed] of Object.entries(LOOKS)) {
        const value = persona.look?.[field];
        if (value !== undefined && !allowed.includes(value)) {
            throw new Error(`roster ${id}: ${persona.name} has an unknown ${field} "${value}"`);
        }
    }
}
const byRank = new Map(roster.personas.map((persona) => [persona.rank, persona]));
for (const [rank] of RANKS) {
    if (!byRank.has(rank)) {
        throw new Error(`roster ${id} has no persona for ${rank}`);
    }
}

const manifest = {
    id,
    version: 1,
    type: 'DECK',
    name: { uk: roster.name },
    back: 'cards/back.svg',
    styles: 'anim/fx.css',
    cards: {},
    sounds: Object.fromEntries(Object.keys(roster.sounds).map((name) => [name, `sounds/${name}.wav`])),
    animations: roster.animations,
    rules: roster.rules,
};

mkdirSync(join(OUT, 'cards'), { recursive: true });
mkdirSync(join(OUT, 'anim'), { recursive: true });
mkdirSync(join(OUT, 'sounds'), { recursive: true });
for (const suit of Object.keys(SUITS)) {
    for (const [rank, label] of RANKS) {
        const persona = byRank.get(rank);
        const cardId = `${rank}_OF_${suit}`;
        const quote = persona.quotes[suit];
        if (!quote) {
            throw new Error(`roster ${id}: ${persona.name} has no quote for ${suit}`);
        }
        writeFileSync(join(OUT, 'cards', `${cardId}.svg`), face({ label, suit, persona, quote }));
        manifest.cards[cardId] = {
            image: `cards/${cardId}.svg`,
            title: { uk: persona.name },
            tags: [persona.tag],
        };
    }
}
writeFileSync(join(OUT, 'cards', 'back.svg'), roster.back());
writeFileSync(join(OUT, 'anim', 'fx.css'), roster.styles);
for (const [name, samples] of Object.entries(roster.sounds)) {
    writeFileSync(join(OUT, 'sounds', `${name}.wav`), wav(samples));
}
const file = join(OUT, 'pack.json');
const options = { ...(await prettier.resolveConfig(file)), parser: 'json' };
writeFileSync(file, await prettier.format(JSON.stringify(manifest), options));
console.log(
    `Wrote ${id}: ${Object.keys(manifest.cards).length} faces, a back, ${Object.keys(roster.sounds).length} sounds, ${roster.rules.length} rules`,
);
