import type { DuelResult, DuelView } from '../api/types';
import { type Card, sameCard } from './cards';
import { role } from './selectors';

type Side = 'you' | 'opponent';

/**
 * What changed on the table between two views, as events worth animating or reacting to. Derived here because
 * the server sends state, not events: the SSE stream only nudges a re-fetch. The content rule engine (MVP 4)
 * consumes the same stream.
 */
export type TableEvent =
    | { type: 'duel_started' }
    | { type: 'card_played'; card: Card; by: Side }
    | { type: 'card_beaten'; attack: Card; defence: Card; by: Side }
    | { type: 'cards_taken'; by: Side; count: number }
    | { type: 'attack_ended'; count: number }
    | { type: 'card_dealt'; count: number; to: Side }
    | { type: 'turn_started'; yours: boolean }
    | { type: 'duel_finished'; result: DuelResult };

export interface Result {
    result: DuelResult;
    reason: string | undefined;
}

export function resultOf(view: DuelView): Result {
    const outcome = view.outcome;
    if (!outcome || outcome.draw) {
        return { result: 'DRAW', reason: outcome?.reason };
    }
    return { result: outcome.winner === view.you ? 'WON' : 'LOST', reason: outcome.reason };
}

const yourTurn = (view: DuelView) => role(view) === 'attacker';

export function diffViews(prev: DuelView | undefined, next: DuelView): TableEvent[] {
    const events: TableEvent[] = [];
    if (!prev) {
        events.push({ type: 'duel_started' });
        if (next.phase !== 'FINISHED') {
            events.push({ type: 'turn_started', yours: yourTurn(next) });
        } else {
            events.push({ type: 'duel_finished', result: resultOf(next).result });
        }
        return events;
    }

    const attacker: Side = prev.attacker === prev.you ? 'you' : 'opponent';
    const defender: Side = attacker === 'you' ? 'opponent' : 'you';
    const tableCards = (view: DuelView) => view.table.reduce((n, pair) => n + (pair.defence ? 2 : 1), 0);

    // Cards that landed on the table: new attacks, and defences added to attacks already there.
    for (const pair of next.table) {
        const before = prev.table.find((old) => sameCard(old.attack, pair.attack));
        if (!before) {
            events.push({ type: 'card_played', card: pair.attack, by: attacker });
        }
        if (pair.defence && !before?.defence) {
            events.push({ type: 'card_beaten', attack: pair.attack, defence: pair.defence, by: defender });
        }
    }

    // The table clearing is either a take (the defender's hand grew by what was on it) or the end of an attack.
    const yourGrowth = next.hand.length - prev.hand.length;
    const theirGrowth = next.opponentHandCount - prev.opponentHandCount;
    let takenBy: Side | undefined;
    if (prev.table.length > 0 && next.table.length === 0) {
        const onTable = tableCards(prev);
        if (next.discardCount > prev.discardCount) {
            events.push({ type: 'attack_ended', count: onTable });
        } else {
            takenBy = defender;
            events.push({ type: 'cards_taken', by: defender, count: onTable });
        }
    }

    // Growth not explained by a take is the deal from the talon; only announced when the talon actually shrank
    // or the table was empty, so a mid-round re-fetch never invents a deal.
    const takenCount = takenBy ? tableCards(prev) : 0;
    const dealtToYou = yourGrowth - (takenBy === 'you' ? takenCount : 0);
    const dealtToThem = theirGrowth - (takenBy === 'opponent' ? takenCount : 0);
    if (dealtToYou > 0) {
        events.push({ type: 'card_dealt', count: dealtToYou, to: 'you' });
    }
    if (dealtToThem > 0) {
        events.push({ type: 'card_dealt', count: dealtToThem, to: 'opponent' });
    }

    if (next.phase === 'FINISHED') {
        if (prev.phase !== 'FINISHED') {
            events.push({ type: 'duel_finished', result: resultOf(next).result });
        }
    } else if (yourTurn(prev) !== yourTurn(next) || prev.phase === 'FINISHED') {
        events.push({ type: 'turn_started', yours: yourTurn(next) });
    }
    return events;
}
