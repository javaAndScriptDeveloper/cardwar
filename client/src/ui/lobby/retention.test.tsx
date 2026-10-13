import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import type { MissionView, ProgressView, ShopItemView } from '../../api/types';
import { t } from '../../i18n';
import { DropTeaser } from './DropTeaser';
import { Missions } from './Missions';
import { StreakChip } from './StreakChip';

const progress = (winStreak: number): ProgressView => ({
    duelsPlayed: 10,
    duelsWon: 6,
    currencyBalance: 500,
    winStreak,
    bestWinStreak: 4,
    xp: 120,
    rank: 'PIDKYDNYI',
    nextRankXp: 300,
    streakBonusPercent: 10 * Math.min(winStreak, 5),
});

const mission = (code: string, progress: number, target: number, claimed = false): MissionView => ({
    code,
    target,
    progress,
    reward: 60,
    claimed,
});

describe('StreakChip', () => {
    it('names the streak and the bonus the next staked win pays', () => {
        render(<StreakChip progress={progress(3)} />);

        const chip = screen.getByTestId('streak-chip');
        expect(chip.getAttribute('data-streak')).toBe('3');
        expect(chip.textContent).toBe(t('streak.chip', { n: 3, percent: 30 }));
    });

    it('shows nothing without a streak', () => {
        render(<StreakChip progress={progress(0)} />);

        expect(screen.queryByTestId('streak-chip')).toBeNull();
    });
});

describe('Missions', () => {
    it('lists the three missions with progress, and a claim button only on a completed, unclaimed one', () => {
        const onClaim = vi.fn().mockResolvedValue(undefined);
        render(
            <Missions
                missions={[
                    mission('PLAY_3', 1, 3),
                    mission('WIN_2', 2, 2),
                    mission('STAKED_WIN_1', 1, 1, true),
                ]}
                onClaim={onClaim}
            />,
        );

        const rows = screen.getAllByTestId('mission-row');
        expect(rows.map((row) => row.getAttribute('data-code'))).toEqual(['PLAY_3', 'WIN_2', 'STAKED_WIN_1']);
        expect(rows.map((row) => row.getAttribute('data-progress'))).toEqual(['1', '2', '1']);
        expect(rows.map((row) => row.getAttribute('data-claimed'))).toEqual(['false', 'false', 'true']);
        expect(rows[0]?.textContent).toContain(t('missions.PLAY_3'));
        expect(screen.queryByTestId('claim-PLAY_3')).toBeNull();
        expect(screen.queryByTestId('claim-STAKED_WIN_1')).toBeNull();
        expect(rows[2]?.textContent).toContain(t('missions.claimed'));

        fireEvent.click(screen.getByTestId('claim-WIN_2'));
        expect(onClaim).toHaveBeenCalledWith('WIN_2');
    });
});

describe('DropTeaser', () => {
    const drop: ShopItemView = {
        code: 'back-bavovna',
        type: 'CARD_BACK',
        contentRef: 'bavovna',
        name: 'Бавовна',
        price: 900,
        owned: false,
        equipped: false,
        availableUntil: new Date(Date.now() + 2 * 86_400_000 + 3 * 3_600_000 + 60_000).toISOString(),
    };

    it('names the drop, counts down its week and opens the shop', () => {
        const onOpenShop = vi.fn();
        render(<DropTeaser drop={drop} onOpenShop={onOpenShop} />);

        const teaser = screen.getByTestId('drop-teaser');
        expect(teaser.getAttribute('data-code')).toBe('back-bavovna');
        expect(teaser.textContent).toContain('Бавовна');
        expect(teaser.textContent).toContain(t('shop.drop.left', { d: 2, h: 3 }));
        fireEvent.click(screen.getByTestId('open-shop'));
        expect(onOpenShop).toHaveBeenCalled();
    });
});
