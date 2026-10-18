import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CARD_IDS } from './schema';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', '..', 'public', 'packs', 'karykatury');
const read = (name: string) => readFileSync(join(dir, 'cards', name), 'utf8');

/**
 * «Карикатури»: the likeness deck. Two personas per rank, one colour each, and every card carries its own LoRA
 * portrait embedded as a jpeg (never fetched). Titles are nicknames, not surnames: the satire lives in the role
 * and the caption. One persona (the black six) has no LoRA yet and keeps the vector avatar until it is trained.
 */
describe('karykatury pack', () => {
    const faces = readdirSync(join(dir, 'cards')).filter((name) => name !== 'back.svg');
    const manifest = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')) as {
        cards: Record<string, { title: { uk: string }; tags: string[] }>;
        rules: { id: string }[];
    };

    it('has 36 faces with a satire stamp, corner indices and no external references', () => {
        expect(faces).toHaveLength(36);
        for (const cardId of CARD_IDS) {
            const svg = read(`${cardId}.svg`);
            expect(svg, cardId).toContain('class="stamp"');
            expect(svg, cardId).not.toMatch(/href="(?!data:image\/jpeg;base64,)|url\((?!#)|<script/);
        }
        expect(read('back.svg')).not.toMatch(/<image|href=|url\(http|data:/);
    });

    it('embeds a portrait on every card except the untrained black six', () => {
        for (const cardId of CARD_IDS) {
            const svg = read(`${cardId}.svg`);
            if (cardId === 'SIX_OF_SPADES' || cardId === 'SIX_OF_CLUBS') {
                expect(svg, cardId).toContain('class="avatar"');
            } else {
                expect(svg, cardId).toContain('<image href="data:image/jpeg;base64,');
                expect(svg, cardId).not.toContain('class="avatar"');
            }
        }
    });

    it('gives each persona the two cards of one colour and rank, named by nickname', () => {
        const surnames = [
            'Зеленськ',
            'Єрмак',
            'Порошенк',
            'Кличк',
            'Тимошенк',
            'Безугл',
            'Притул',
            'Стерненк',
            'Арестович',
            'Гончаренк',
            'Нікітюк',
            'Дурнєв',
            'Дорофєєв',
            'Дантес',
            'Міндич',
            'Гороховськ',
            'Коломойськ',
        ];
        const byTag = new Map<string, string[]>();
        for (const [cardId, card] of Object.entries(manifest.cards)) {
            for (const surname of surnames) {
                expect(card.title.uk, cardId).not.toContain(surname);
            }
            const [tag] = card.tags;
            byTag.set(tag ?? '', [...(byTag.get(tag ?? '') ?? []), cardId]);
        }
        expect(byTag.size).toBe(18);
        for (const [tag, cards] of byTag) {
            expect(cards, tag).toHaveLength(2);
            const [a = '', b = ''] = cards
                .map((id) => id.split('_OF_'))
                .map(([rank, suit]) => `${rank} ${suit}`);
            expect(a.split(' ')[0], tag).toBe(b.split(' ')[0]);
            const red = (s: string) => s.endsWith('HEARTS') || s.endsWith('DIAMONDS');
            expect(red(a), tag).toBe(red(b));
        }
    });

    it('talks at the table', () => {
        expect(manifest.rules.length).toBeGreaterThanOrEqual(8);
    });
});
