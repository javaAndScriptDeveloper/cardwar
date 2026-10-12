import type { ComponentChildren } from 'preact';

interface Props {
    leading?: ComponentChildren;
    title: string;
    subtitle?: string | undefined;
    trailing?: ComponentChildren;
    onClick?: () => void;
    'data-testid'?: string;
}

/** One row of a list: avatar or icon, a title with an optional second line, something on the right. */
export function ListRow({ leading, title, subtitle, trailing, onClick, 'data-testid': testId }: Props) {
    const body = (
        <>
            {leading && <span class="list-row-leading">{leading}</span>}
            <span class="list-row-text">
                <span class="list-row-title">{title}</span>
                {subtitle && <span class="list-row-subtitle">{subtitle}</span>}
            </span>
            {trailing && <span class="list-row-trailing">{trailing}</span>}
        </>
    );
    if (onClick) {
        return (
            <button type="button" class="list-row tappable" onClick={onClick} data-testid={testId}>
                {body}
            </button>
        );
    }
    return (
        <div class="list-row" data-testid={testId}>
            {body}
        </div>
    );
}
