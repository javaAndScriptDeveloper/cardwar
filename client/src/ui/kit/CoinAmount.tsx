const THIN_SPACE = ' ';
const MINUS = '−';

/** 1234567 → "1 234 567" with thin spaces, the Ukrainian way to group digits without breaking a narrow chip. */
export function formatCoins(amount: number): string {
    return String(Math.abs(Math.trunc(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

interface Props {
    amount: number;
    /** Show + for gains and − for losses (results, history, ledger rows); a balance is never signed. */
    signed?: boolean;
    class?: string;
    'data-testid'?: string;
}

export function CoinAmount({ amount, signed = false, class: extra, 'data-testid': testId }: Props) {
    const sign = amount < 0 ? MINUS : signed && amount > 0 ? '+' : '';
    const tone = signed ? (amount > 0 ? ' gain' : amount < 0 ? ' loss' : '') : '';
    return (
        <span class={`coins${tone}${extra ? ` ${extra}` : ''}`} data-testid={testId} data-amount={amount}>
            <span class="coin-glyph" aria-hidden="true" />
            {sign}
            {formatCoins(amount)}
        </span>
    );
}
