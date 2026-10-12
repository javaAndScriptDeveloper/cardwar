import { type Card, cardId } from '../game/cards';
import type { LayoutKind } from './types';

export interface LayoutDirective {
    layout: LayoutKind;
    cards: readonly string[];
}

/**
 * The order the hand is drawn in. Cosmetic by contract: it only permutes the cards it is given, so a layout can
 * never hide, add or play a card. Directives apply in order; cards a directive names but the hand lacks are ignored.
 */
export function arrange(hand: readonly Card[], directives: readonly LayoutDirective[]): Card[] {
    let out = [...hand];
    for (const directive of directives) {
        const wanted = [...new Set(directive.cards)];
        const held = wanted
            .map((id) => out.find((card) => cardId(card) === id))
            .filter((card): card is Card => card !== undefined);
        const rest = out.filter((card) => !held.includes(card));
        switch (directive.layout) {
            case 'stick_together': {
                if (held.length < 2) {
                    break;
                }
                // Gather where the first of them already sits, so the rest of the hand does not jump around.
                const anchor = out.findIndex((card) => held.includes(card));
                out = [...rest.slice(0, anchor), ...held, ...rest.slice(anchor)];
                break;
            }
            case 'pin_left':
                out = [...held, ...rest];
                break;
            case 'pin_right':
                out = [...rest, ...held];
                break;
        }
    }
    return out;
}
