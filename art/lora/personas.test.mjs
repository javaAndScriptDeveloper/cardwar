// Guards the persona export the GPU-side scripts read: run with `node --test art/lora/personas.test.mjs`.
//
// personas.json is generated from the satire rosters so the trainer and the renderer never carry their own copy
// of who is on which card. It must stay exactly what the rosters say, and every trigger word must be unique,
// otherwise two LoRAs answer the same prompt token and the faces blend.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { EXTRAS, exportPersonas, PACKS } from './personas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

test('every roster persona is exported once with a unique trigger word', async () => {
  const personas = await exportPersonas();
  assert.equal(personas.length, 18 + EXTRAS.length);
  assert.deepEqual([...new Set(personas.map((p) => p.pack))].sort(), [...PACKS, 'extra'].sort());
  const triggers = personas.map((p) => p.trigger);
  assert.equal(new Set(triggers).size, triggers.length);
  for (const persona of personas) {
    assert.match(persona.trigger, /^cw_[a-z]+$/, `${persona.name}: trigger is an ASCII token`);
    assert.equal(persona.trigger, `cw_${persona.tag}`);
    assert.ok(persona.name.length > 0);
    assert.ok(persona.role.length > 0);
    assert.match(persona.colour, /^#[0-9a-f]{6}$/);
    assert.ok(persona.generated === null || /^\d{4}-\d{2}-\d{2}$/.test(persona.generated));
    if (persona.pack === 'extra') {
      assert.equal(persona.rank, null);
      assert.deepEqual(persona.cards, [], `${persona.name} has a LoRA but no card yet`);
    } else {
      assert.equal(persona.cards.length, 4, `${persona.name} owns one card per suit`);
      assert.ok(persona.cards.every((card) => card.startsWith(`${persona.rank}_OF_`)));
    }
  }
});

test('extras are personas trained ahead of a roster slot', async () => {
  const personas = await exportPersonas();
  const extras = personas.filter((p) => p.pack === 'extra').map((p) => p.tag);
  assert.deepEqual(extras, ['dantes', 'dorofeeva']);
});

test('the committed personas.json is exactly what the rosters produce', async () => {
  const committed = JSON.parse(readFileSync(join(HERE, 'personas.json'), 'utf8'));
  assert.deepEqual(committed, await exportPersonas());
});
