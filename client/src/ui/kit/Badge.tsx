import type { ComponentChildren } from 'preact';

export function Badge({
    tone = 'neutral',
    children,
}: {
    tone?: 'neutral' | 'accent' | 'success' | 'danger';
    children: ComponentChildren;
}) {
    return <span class={`badge ${tone}`}>{children}</span>;
}
