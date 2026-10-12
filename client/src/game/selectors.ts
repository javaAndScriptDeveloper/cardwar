import type { DuelView } from '../api/types';
import { t } from '../i18n';
import { type Card, type Suit, rankValue, sameCard } from './cards';

/**
 * Pure functions over the caller's redacted view, used only to enable and disable controls. They mirror the engine
 * (cardwar.engine.DurakEngine) rule for rule, but the server stays the judge: a move these allow can still be
 * refused, and the UI then shows the engine's reason.
 */

/** Mirrors DurakEngine.MAX_ATTACK_CARDS. */
export const MAX_ATTACK_CARDS = 6;

export type Role = 'attacker' | 'defender';

export function role(view: DuelView): Role {
    return view.attacker === view.you ? 'attacker' : 'defender';
}

/** Mirrors DurakRules.beats. */
export function beats(attack: Card, defence: Card, trump: Suit): boolean {
    const attackIsTrump = attack.suit === trump;
    const defenceIsTrump = defence.suit === trump;
    if (attackIsTrump) {
        return defenceIsTrump && rankValue(defence.rank) > rankValue(attack.rank);
    }
    if (defenceIsTrump) {
        return true;
    }
    return defence.suit === attack.suit && rankValue(defence.rank) > rankValue(attack.rank);
}

export function undefendedAttacks(view: DuelView): Card[] {
    return view.table.filter((pair) => !pair.defence).map((pair) => pair.attack);
}

const inHand = (view: DuelView, card: Card) => view.hand.some((held) => sameCard(held, card));
const live = (view: DuelView) => view.phase !== 'FINISHED';

/**
 * The engine checks turn, the six-card cap, the defender's capacity and the throw-in rank, but not the phase: the
 * attacker may keep throwing in while the defender is still answering.
 */
export function canAttackWith(view: DuelView, card: Card): boolean {
    if (!live(view) || role(view) !== 'attacker' || !inHand(view, card)) {
        return false;
    }
    if (view.table.length >= MAX_ATTACK_CARDS) {
        return false;
    }
    // When I attack, the opponent defends, so their hand is the defender's hand.
    if (undefendedAttacks(view).length >= view.opponentHandCount) {
        return false;
    }
    if (view.table.length === 0) {
        return true;
    }
    return view.table.some(
        (pair) =>
            pair.attack.rank === card.rank || (pair.defence !== undefined && pair.defence.rank === card.rank),
    );
}

export function canDefend(view: DuelView, target: Card, card: Card): boolean {
    return (
        live(view) &&
        role(view) === 'defender' &&
        inHand(view, card) &&
        undefendedAttacks(view).some((attack) => sameCard(attack, target)) &&
        beats(target, card, view.trumpSuit)
    );
}

/** Undefended attacks that this hand card would beat: the possible targets once it is chosen. */
export function targetsFor(view: DuelView, card: Card): Card[] {
    return undefendedAttacks(view).filter((target) => canDefend(view, target, card));
}

export function canTake(view: DuelView): boolean {
    return live(view) && role(view) === 'defender' && undefendedAttacks(view).length > 0;
}

export function canEndAttack(view: DuelView): boolean {
    return (
        live(view) &&
        role(view) === 'attacker' &&
        view.table.length > 0 &&
        undefendedAttacks(view).length === 0
    );
}

/** Hand cards that have at least one legal use right now. */
export function playable(view: DuelView): Card[] {
    return view.hand.filter((card) =>
        role(view) === 'attacker' ? canAttackWith(view, card) : targetsFor(view, card).length > 0,
    );
}

/** The one-line "whose move" text under the table. */
export type StatusState =
    'your-attack' | 'throw-in' | 'defending' | 'defend' | 'waiting-attack' | 'waiting' | 'over';

/** The machine-readable turn state; `status` turns it into a sentence. Tests and E2E read this, never the text. */
export function statusState(view: DuelView): StatusState {
    if (!live(view)) {
        return 'over';
    }
    const undefended = undefendedAttacks(view).length;
    if (role(view) === 'attacker') {
        if (view.table.length === 0) {
            return 'your-attack';
        }
        return undefended > 0 ? 'defending' : 'throw-in';
    }
    if (view.table.length === 0) {
        return 'waiting-attack';
    }
    return undefended > 0 ? 'defend' : 'waiting';
}

export function status(view: DuelView, opponentName: string): string {
    return t(`duel.status.${statusState(view)}`, { name: opponentName });
}
