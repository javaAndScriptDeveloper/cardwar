interface Props {
    tabs: { id: string; label: string }[];
    active: string;
    onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: Props) {
    return (
        <div role="tablist" class="tabs">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={tab.id === active}
                    class={tab.id === active ? 'active' : ''}
                    data-testid={`tab-${tab.id}`}
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
