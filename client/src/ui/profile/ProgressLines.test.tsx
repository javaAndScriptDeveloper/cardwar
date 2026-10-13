import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import type { MissionView, ProgressView } from '../../api/types';
import { t } from '../../i18n';
import { ProgressLines } from './ProgressLines';

const view = (overrides: Partial<ProgressView> = {}): ProgressView => ({
    duelsPlayed: 5,
    duelsWon: 3,
    currencyBalance: 500,
    winStreak: 3,
    bestWinStreak: 3,
    xp: 90,
    rank: 'DURAK',
    nextRankXp: 100,
    streakBonusPercent: 30,
    ...overrides,
});

const mission = (code: string, progress: number, target = 3): MissionView => ({
    code,
    target,
    progress,
    reward: 60,
    claimed: false,
});

describe('ProgressLines', () => {
    it('shows the streak, the XP gained and a rank-up after a win', () => {
        render(
            <ProgressLines
                before={view()}
                after={view({ winStreak: 4, bestWinStreak: 4, xp: 130, rank: 'PIDKYDNYI', nextRankXp: 300 })}
            />,
        );

        expect(screen.getByTestId('streak-line').getAttribute('data-streak')).toBe('4');
        expect(screen.getByTestId('streak-line').textContent).toBe(t('streak.line', { n: 4 }));
        expect(screen.getByTestId('xp-line').getAttribute('data-gained')).toBe('40');
        expect(screen.getByTestId('rank-up').getAttribute('data-rank')).toBe('PIDKYDNYI');
        expect(screen.getByTestId('rank-up').textContent).toBe(
            t('progress.rankUp', { rank: t('progress.rank.PIDKYDNYI') }),
        );
    });

    it('says the streak was broken after a loss, and shows no rank-up', () => {
        render(<ProgressLines before={view()} after={view({ winStreak: 0, xp: 100 })} />);

        expect(screen.getByTestId('streak-line').getAttribute('data-streak')).toBe('0');
        expect(screen.getByTestId('streak-line').textContent).toBe(t('streak.broken'));
        expect(screen.getByTestId('xp-line').getAttribute('data-gained')).toBe('10');
        expect(screen.queryByTestId('rank-up')).toBeNull();
    });

    it('lists only the missions whose progress moved', () => {
        render(
            <ProgressLines
                before={view()}
                after={view()}
                missionsBefore={[mission('PLAY_3', 1), mission('WIN_2', 1, 2)]}
                missionsAfter={[mission('PLAY_3', 2), mission('WIN_2', 1, 2)]}
            />,
        );

        const lines = screen.getAllByTestId('mission-line');
        expect(lines.map((line) => line.getAttribute('data-code'))).toEqual(['PLAY_3']);
        expect(lines[0]?.getAttribute('data-progress')).toBe('2');
        expect(lines[0]?.textContent).toBe(
            t('missions.changed', { title: t('missions.PLAY_3'), progress: 2, target: 3 }),
        );
    });

    it('without a before shows the streak alone, never a gain it cannot know', () => {
        render(<ProgressLines after={view({ winStreak: 0 })} />);

        expect(screen.queryByTestId('streak-line')).toBeNull();
        expect(screen.queryByTestId('xp-line')).toBeNull();
        expect(screen.queryByTestId('rank-up')).toBeNull();
    });
});
