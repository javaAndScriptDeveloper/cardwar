import type { Card, Rank, Suit } from '../game/cards';
import uk from './uk.json';

type Tree = { [key: string]: string | string[] | Tree };
const catalog: Tree = uk as Tree;
const warned = new Set<string>();

function lookup(key: string): string | string[] | undefined {
    let node: Tree[string] | undefined = catalog;
    for (const part of key.split('.')) {
        if (typeof node !== 'object' || node === null || Array.isArray(node)) {
            return undefined;
        }
        node = node[part];
    }
    return typeof node === 'string' || Array.isArray(node) ? node : undefined;
}

/**
 * The one way copy reaches the screen. Ukrainian is the only shipped locale; a second one is another JSON file.
 * A missing key renders as the key itself so it is visible in the UI rather than silently blank.
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
    const text = lookup(key);
    if (typeof text !== 'string') {
        if (import.meta.env.DEV && !warned.has(key)) {
            warned.add(key);
            console.warn(`i18n: missing key ${key}`);
        }
        return key;
    }
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** True when the catalog has a string under `key`; lets callers fall back for codes the catalog does not know. */
export function has(key: string): boolean {
    return typeof lookup(key) === 'string';
}

/** The three plural forms stored under `key` (one, few, many). */
export function forms(key: string): [string, string, string] {
    const value = lookup(key);
    return Array.isArray(value) && value.length === 3 ? (value as [string, string, string]) : [key, key, key];
}

/** Ukrainian plural: 1 карта, 2–4 карти, 5+ карт, with the 11–14 exception. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) {
        return one;
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return few;
    }
    return many;
}

const RANK_KEY: Record<Rank, string> = {
    SIX: 'six',
    SEVEN: 'seven',
    EIGHT: 'eight',
    NINE: 'nine',
    TEN: 'ten',
    JACK: 'jack',
    QUEEN: 'queen',
    KING: 'king',
    ACE: 'ace',
};
const SUIT_KEY: Record<Suit, string> = {
    CLUBS: 'clubs',
    DIAMONDS: 'diamonds',
    HEARTS: 'hearts',
    SPADES: 'spades',
};

/** "Сімка пік": rank as a noun, suit in the genitive. */
/** A suit's name in the genitive, as Ukrainian names a suit on its own ("чирв"). */
export function suitLabel(suit: Suit): string {
    return t(`card.suit.${SUIT_KEY[suit]}`);
}

export function cardLabel(card: Card): string {
    return `${t(`card.rank.${RANK_KEY[card.rank]}`)} ${t(`card.suit.${SUIT_KEY[card.suit]}`)}`;
}
