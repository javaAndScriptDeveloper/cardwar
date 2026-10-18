import { render, screen } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { equipped } from '../../content/loader';
import type { PackManifest } from '../../content/types';
import { t } from '../../i18n';
import { MyCards } from './MyCards';

const base = import.meta.env.BASE_URL;
const pack = (id: string) =>
    JSON.parse(readFileSync(resolve('public/packs', id, 'pack.json'), 'utf8')) as PackManifest;

describe('MyCards', () => {
    afterEach(() => {
        equipped.value = undefined;
    });

    it('lays out all 36 faces of the equipped deck, rank by rank, under the deck name', () => {
        equipped.value = pack('karykatury');
        render(<MyCards />);

        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t('cards.title'));
        expect(screen.getByTestId('deck-name').textContent).toBe('Карикатури (сатира)');
        const faces = screen.getAllByTestId('gallery-card');
        expect(faces).toHaveLength(36);
        expect(faces[0]?.getAttribute('data-card')).toBe('ACE_OF_HEARTS');
        expect(faces[0]?.querySelector('img')?.getAttribute('src')).toBe(
            `${base}packs/karykatury/cards/ACE_OF_HEARTS.svg`,
        );
        // The card's own title from the pack, so the player learns who is who.
        expect(faces[0]?.textContent).toContain('Голобородько');
    });

    it('shows the classic faces when no pack is equipped', () => {
        render(<MyCards />);

        expect(screen.getByTestId('deck-name').textContent).toBe(t('cards.classic'));
        expect(screen.getAllByTestId('gallery-card')[0]?.querySelector('img')?.getAttribute('src')).toBe(
            `${base}cards/classic/ace_of_hearts.svg`,
        );
    });
});
