// Exports the satire personas for the GPU side (art/lora/pod/*), which has no Node and must not re-type who sits on
// which card. Run `node art/lora/personas.mjs` after editing a roster; personas.test.mjs fails until the committed
// personas.json matches again.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITS = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];

/** Pack ids whose rosters carry personas; add a pack here when its roster lands. */
export const PACKS = ['blogery', 'sluhy-narodu'];

/**
 * Personas the owner wants a LoRA for before any roster has a card for them (both decks are full at 9 × 4). They
 * train and render like the others under pack `extra`; moving one onto a card later is a roster edit, the LoRA
 * and renders carry over because the trigger word is the tag.
 */
export const EXTRAS = [
  {
    tag: 'dantes',
    name: 'Дантес',
    role: 'співає',
    colour: '#5d4037',
    art: 'a brooding 1890s Lemberg vampire, long dark curly hair and a short beard, pale skin, fangs showing in a seductive smirk, high-collared black cape with crimson lining, candlelit gothic mansion and a full moon behind him',
  },
  { tag: 'dorofeeva', name: 'Дорофєєва', role: 'співає', colour: '#c2185b' },
  {
    tag: 'mindich',
    name: 'Міндіч',
    role: 'бізнес',
    colour: '#1b5e20',
    art: 'a grinning energy baron in a shiny suit, hugging a glowing power transformer, a briefcase overflowing with stolen lightning bolts, copper wires and sparks everywhere, a spinning electricity meter and power lines behind him',
  },
];

/** Tag → date of the first render batch saved in the private data repo (`renders/<pack>/<tag>/`). */
const GENERATED = {
  horokhovskyi: '2026-10-17',
};

/**
 * One entry per persona: pack, tag, LoRA trigger word (`cw_<tag>`, an ASCII token no caption would contain by
 * accident), display name, role, poster colour, rank, the four card ids the portrait will end up on, and
 * `generated`: the date of the first saved render batch, null while the persona is photos only.
 */
export async function exportPersonas() {
  const personas = [];
  for (const pack of PACKS) {
    const roster = (await import(`../../client/scripts/rosters/${pack}.mjs`)).default;
    for (const persona of roster.personas) {
      personas.push({
        pack,
        tag: persona.tag,
        trigger: `cw_${persona.tag}`,
        name: persona.name,
        role: persona.role,
        art: persona.art ?? null,
        colour: persona.colour,
        rank: persona.rank,
        cards: SUITS.map((suit) => `${persona.rank}_OF_${suit}`),
        generated: GENERATED[persona.tag] ?? null,
      });
    }
  }
  for (const extra of EXTRAS) {
    personas.push({
      pack: 'extra',
      tag: extra.tag,
      trigger: `cw_${extra.tag}`,
      name: extra.name,
      role: extra.role,
      art: extra.art ?? null,
      colour: extra.colour,
      rank: null,
      cards: [],
      generated: GENERATED[extra.tag] ?? null,
    });
  }
  return personas;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const personas = await exportPersonas();
  writeFileSync(join(HERE, 'personas.json'), `${JSON.stringify(personas, null, 2)}\n`);
  console.log(`Wrote ${personas.length} personas to art/lora/personas.json`);
}
