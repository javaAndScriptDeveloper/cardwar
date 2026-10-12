import { useState } from 'preact/hooks';

/** Up to two initials; "?" for a blank name so the circle is never empty. */
export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }
    return parts
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('');
}

interface Props {
    name: string;
    photoUrl?: string | undefined;
    size?: number;
    'data-testid'?: string;
}

/** A Telegram profile photo when there is one and it loads; initials otherwise. Never a broken image. */
export function Avatar({ name, photoUrl, size = 40, 'data-testid': testId }: Props) {
    const [broken, setBroken] = useState(false);
    const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` };
    if (photoUrl && !broken) {
        return (
            <img
                class="avatar"
                style={style}
                src={photoUrl}
                alt=""
                referrerpolicy="no-referrer"
                onError={() => setBroken(true)}
                data-testid={testId}
            />
        );
    }
    return (
        <span class="avatar initials" style={style} aria-hidden="true" data-testid={testId}>
            {initials(name)}
        </span>
    );
}
