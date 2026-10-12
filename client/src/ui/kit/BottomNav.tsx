import { t } from '../../i18n';

export type NavItem = 'lobby' | 'friends' | 'shop' | 'profile';

const ITEMS: { name: NavItem; key: string; icon: string }[] = [
    // Simple 24px outline paths; a real icon set can replace them without touching the callers.
    {
        name: 'lobby',
        key: 'nav.play',
        icon: 'M4 5h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm12 2 4.4-1.3a1 1 0 0 1 1.3.7l2.6 9.6a1 1 0 0 1-.7 1.2L18 18.5',
    },
    {
        name: 'friends',
        key: 'nav.friends',
        icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-9 10a5 5 0 0 1 10 0M4 9a3 3 0 1 0 0-.1M20 9a3 3 0 1 1 0-.1M2 19a4 4 0 0 1 4-4M22 19a4 4 0 0 0-4-4',
    },
    { name: 'shop', key: 'nav.shop', icon: 'M5 8h14l-1 12H6L5 8Zm3 0a4 4 0 0 1 8 0' },
    { name: 'profile', key: 'nav.profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0' },
];

export function BottomNav({ active, onSelect }: { active: NavItem; onSelect: (name: NavItem) => void }) {
    return (
        <nav class="bottom-nav">
            {ITEMS.map((item) => (
                <button
                    key={item.name}
                    type="button"
                    data-testid={`nav-${item.name}`}
                    aria-current={active === item.name ? 'page' : undefined}
                    onClick={() => onSelect(item.name)}
                >
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                        <path
                            d={item.icon}
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linejoin="round"
                        />
                    </svg>
                    <span>{t(item.key)}</span>
                </button>
            ))}
        </nav>
    );
}
