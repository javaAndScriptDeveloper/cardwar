import type { ComponentChildren } from 'preact';

interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'md' | 'lg';
    busy?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit';
    onClick?: () => void;
    'data-testid'?: string;
    children: ComponentChildren;
}

export function Button({
    variant = 'secondary',
    size = 'md',
    busy = false,
    disabled = false,
    type = 'button',
    onClick,
    'data-testid': testId,
    children,
}: Props) {
    return (
        <button
            type={type}
            class={`btn ${variant} ${size}`}
            disabled={disabled || busy}
            aria-busy={busy}
            onClick={onClick}
            data-testid={testId}
        >
            {busy && <span class="spinner" aria-hidden="true" />}
            {children}
        </button>
    );
}
