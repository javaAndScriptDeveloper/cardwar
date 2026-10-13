import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionView, ProgressView } from '../api/types';
import { missions, progress, refreshMissions, refreshProgress } from './progress';

const view = (xp: number): ProgressView => ({
    duelsPlayed: 3,
    duelsWon: 2,
    currencyBalance: 500,
    winStreak: 2,
    bestWinStreak: 2,
    xp,
    rank: 'DURAK',
    nextRankXp: 100,
    streakBonusPercent: 20,
});

const mission = (code: string): MissionView => ({ code, target: 3, progress: 1, reward: 60, claimed: false });

describe('progress', () => {
    beforeEach(() => {
        progress.value = undefined;
        missions.value = undefined;
    });

    it('loads the progress into the signal', async () => {
        await refreshProgress({ progress: vi.fn().mockResolvedValue(view(70)) });

        expect(progress.value?.xp).toBe(70);
    });

    it('keeps the last known progress when a refresh fails', async () => {
        progress.value = view(70);

        await refreshProgress({ progress: vi.fn().mockRejectedValue(new Error('offline')) });

        expect(progress.value?.xp).toBe(70);
    });

    it('loads the missions and keeps the last list on failure', async () => {
        await refreshMissions({ missions: vi.fn().mockResolvedValue([mission('PLAY_3')]) });
        expect(missions.value?.map((row) => row.code)).toEqual(['PLAY_3']);

        await refreshMissions({ missions: vi.fn().mockRejectedValue(new Error('offline')) });
        expect(missions.value?.map((row) => row.code)).toEqual(['PLAY_3']);
    });
});
