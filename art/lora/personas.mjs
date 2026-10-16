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
 * One entry per persona: pack, tag, LoRA trigger word (`cw_<tag>`, an ASCII token no caption would contain by
 * accident), display name, role, poster colour, rank and the four card ids the portrait will end up on.
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
      });
    }
  }
  return personas;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const personas = await exportPersonas();
  writeFileSync(join(HERE, 'personas.json'), `${JSON.stringify(personas, null, 2)}\n`);
  console.log(`Wrote ${personas.length} personas to art/lora/personas.json`);
}
