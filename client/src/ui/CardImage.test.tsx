import { render, screen } from '@testing-library/preact';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_DECK, cardId } from '../game/cards';
import { CardBack, CardImage, cardImageUrl } from './CardImage';

// Vitest runs from client/; jsdom's import.meta.url is not a file URL, so resolve from the working directory.
const base = import.meta.env.BASE_URL;
const publicDir = `${resolve('public')}/`;

describe('CardImage', () => {
    it('maps every card to the catalog seed image_ref under the app base URL', () => {
        expect(cardImageUrl({ rank: 'SIX', suit: 'CLUBS' })).toBe(`${base}cards/classic/six_of_clubs.svg`);
        expect(cardImageUrl({ rank: 'ACE', suit: 'HEARTS' })).toBe(`${base}cards/classic/ace_of_hearts.svg`);
    });

    it('has a generated file for all 36 cards and the back', () => {
        expect(FULL_DECK).toHaveLength(36);
        for (const card of FULL_DECK) {
            const file = `${publicDir}${cardImageUrl(card).slice(base.length)}`;
            expect(existsSync(file), file).toBe(true);
        }
        expect(existsSync(`${publicDir}cards/classic/back.svg`)).toBe(true);
    });

    it('renders all 36 faces with readable names', () => {
        render(
            <div>
                {FULL_DECK.map((card) => (
                    <CardImage key={cardId(card)} card={card} />
                ))}
                <CardBack />
            </div>,
        );

        const images = screen.getAllByRole('img');
        expect(images).toHaveLength(37);
        expect(screen.getByAltText('Дама пік').getAttribute('src')).toBe(
            `${base}cards/classic/queen_of_spades.svg`,
        );
        expect(screen.getByAltText('Сорочка карти').getAttribute('src')).toBe(
            `${base}cards/classic/back.svg`,
        );
    });
});
