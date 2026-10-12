import { test } from '@playwright/test';
import { playToResult, result, signIn, status } from './helpers';

/** Joins a human's invite as a dev-login account on prod and plays greedily until the duel ends. */
test('opponent bot', async ({ browser }) => {
    test.setTimeout(20 * 60_000);
    const code = process.env['INVITE'] ?? '';
    const bot = await signIn(browser, `bot-${Date.now() % 1_000_000}`, `/app/?invite=${code}`);
    await status(bot).waitFor({ timeout: 60_000 });
    await bot.screenshot({ path: '/tmp/claude-1000/playtest/bot-start.png' });
    await playToResult([bot, bot], { maxMoves: 400, deadlineMs: 18 * 60_000 });
    await bot.screenshot({ path: '/tmp/claude-1000/playtest/bot-end.png' });
    console.log('RESULT', await result(bot).getAttribute('data-result'));
});
