import { expect, test } from '@playwright/test';
import { invite, runSuffix, signIn } from './helpers';

/**
 * A new player spends starter coins in the shop: the trident card back (300 of 500) and the like emote (100). At a
 * friendly duel against a second browser the opponent sees the trident on this player's fan, and an emote thrown
 * from the tray floats over the sender's avatar on the other phone. Stars are not bought here: that needs Telegram.
 */
test('buy and equip a card back with starter coins; the opponent sees it, and an emote reaches them', async ({
    browser,
}) => {
    const suffix = runSuffix();
    const alice = await signIn(browser, `e2e-shop-a-${suffix}`);
    await expect(alice.getByTestId('balance')).toHaveAttribute('data-balance', '500');

    await alice.getByTestId('nav-shop').click();
    await alice.getByTestId('tab-backs').click();
    await alice.getByTestId('buy-back-trident').click();
    await expect(alice.getByTestId('balance')).toHaveAttribute('data-balance', '200');
    await alice.getByTestId('equip-back-trident').click();
    await expect(alice.getByTestId('item-back-trident')).toHaveAttribute('data-equipped', 'true');
    await expect(alice.getByTestId('item-back-classic')).toHaveAttribute('data-equipped', 'false');

    await alice.getByTestId('tab-emotes').click();
    await alice.getByTestId('buy-emote-like').click();
    await expect(alice.getByTestId('balance')).toHaveAttribute('data-balance', '100');
    await expect(alice.getByTestId('item-emote-like')).toHaveAttribute('data-owned', 'true');

    await alice.getByTestId('nav-lobby').click();
    const code = await invite(alice, 0);
    expect(code).toMatch(/^[0-9a-f-]{36}$/);
    const bob = await signIn(browser, `e2e-shop-b-${suffix}`, `/app/?invite=${code}`);

    await expect(bob.getByRole('status')).toBeVisible();
    await expect(alice.getByRole('status')).toBeVisible();
    // Bob's view carries Alice's cosmetics; Alice's own talon shows her back.
    await expect(bob.getByTestId('opponent-fan')).toHaveAttribute('data-back', 'trident');
    await expect(alice.getByTestId('talon')).toHaveAttribute('data-back', 'trident');
    await expect(alice.getByTestId('opponent-fan')).toHaveAttribute('data-back', 'classic');

    await alice.getByTestId('emote-tray').click();
    await alice.getByTestId('emote-like').click();
    const bubble = bob.getByTestId('emote-bubble');
    await expect(bubble).toHaveAttribute('data-emote', 'like');
    await expect(bubble).toHaveAttribute('data-from', 'opponent');
});
