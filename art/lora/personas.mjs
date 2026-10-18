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
    art: 'a brooding 1890s Lemberg vampire, long dark curly hair and a short beard, pale skin, fangs showing in a seductive smirk, high-collared black cape with crimson lining, a cracked heart-shaped locket on a chain at his chest, candlelit gothic mansion and a full moon behind him',
    altArt: 'a backpacker TV host with a golden credit card and a worn paper map, curly hair in the wind, airport departure board behind him',
  },
  {
    tag: 'dorofeeva',
    name: 'Дорофєєва',
    role: 'співає',
    colour: '#c2185b',
    art: 'a daring pop diva in a sparkling sequin stage outfit, bold winged eyeliner and glossy lips, blowing a kiss at the camera, long dark wavy hair, rhinestone microphone in hand, neon stage lights and glitter behind her',
    altArt: 'a 2010s pop video look, glitter and bubble-gum pink, oversized headphones, retro camcorder frame, playful wink',
  },
  {
    tag: 'mindich',
    name: 'Міндіч',
    role: 'бізнес',
    colour: '#1b5e20',
    art: 'a grinning energy baron in a shiny suit with a little propeller whirring on his back, mid-flight escape, clutching a suitcase that leaks glowing lightning bolts and gold coins, everything he touches turning to gold, hugging a glowing power transformer, power lines and a spinning electricity meter behind him',
    altArt: 'whispering into an old reel-to-reel tape recorder in a dim back office, tapes spilling from the shelves, curtains drawn',
  },
  {
    tag: 'arestovych',
    name: 'Арестович',
    role: '2–3 тижні',
    colour: '#37474f',
    art: 'pointing at a wall calendar full of crossed-out weeks, a crystal ball on the desk, soothing smile',
    altArt: "lying on a therapist's couch himself with a laptop stream, a candle, a hoodie, thought clouds above him",
  },
  {
    tag: 'klopotenko',
    name: 'Клопотенко',
    role: 'борщ',
    colour: '#b71c1c',
    art: 'a borscht crusader in beetroot-red armour with a ladle for a sword, a steaming cauldron of borscht, curls bursting out of the helmet',
    altArt: 'in an apron in a school cafeteria serving kids a mountain of colourful plates, flinging away a grey Soviet cutlet',
  },
  {
    tag: 'gordon',
    name: 'Гордон',
    role: 'питає',
    colour: '#455a64',
    art: 'in his interview chair with a stack of microphones, a clock showing five hours, the guest asleep in the other chair',
    altArt: 'an oracle with a turban over his glasses, a crystal ball showing a calendar, scrolls of predictions unrolling to the floor',
  },
  {
    tag: 'mudryk',
    name: 'Мудрик',
    role: 'футбол',
    colour: '#1565c0',
    art: 'sprinting in a blue football kit with a giant price tag flapping on his back, motion blur, London skyline',
    altArt: 'alone on a long empty bench in a blue tracksuit scrolling a phone, cobwebs on the ball, rain',
  },
  {
    tag: 'kolomoisky',
    name: 'Коломойський',
    role: 'акули',
    colour: '#2e7d32',
    art: 'feet up on a desk in front of a huge aquarium with sharks, a green suit, a cigar, 1990s office',
    altArt: 'on a prison bunk in a tracksuit with a thick book, a tiny shark in a jar on the windowsill, bars with sunlight',
  },
];

/** Tag → date of the first render batch saved in the private data repo (`renders/<pack>/<tag>/`). */
const GENERATED = {
  horokhovskyi: '2026-10-17',
  yermak: '2026-10-18',
  zelenskyi: '2026-10-18',
  poroshenko: '2026-10-18',
  klychko: '2026-10-18',
  honcharenko: '2026-10-18',
  bezuhla: '2026-10-18',
  nikitiuk: '2026-10-18',
  petya: '2026-10-18',
  durnev: '2026-10-18',
  dantes: '2026-10-18',
  dorofeeva: '2026-10-18',
  mindich: '2026-10-18',
  sternenko: '2026-10-18',
  prytula: '2026-10-18',
  tymoshenko: '2026-10-18',
  arestovych: '2026-10-18',
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
        altArt: persona.altArt ?? null,
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
      altArt: extra.altArt ?? null,
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
