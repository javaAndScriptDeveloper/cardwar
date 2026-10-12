import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, Badge, BottomNav, Button, ListRow, Sheet, Tabs, Toast, initials } from './index';

describe('Avatar', () => {
    it('renders initials when no photo', () => {
        render(<Avatar name="Оля Коваль" />);
        expect(screen.getByText('ОК')).toBeTruthy();
        expect(document.querySelector('img')).toBeNull();
    });

    it('falls back to initials when the photo fails', () => {
        render(<Avatar name="Оля" photoUrl="https://x/p.jpg" />);
        const img = document.querySelector('img');
        expect(img).toBeTruthy();
        fireEvent.error(img as HTMLImageElement);
        expect(screen.getByText('О')).toBeTruthy();
        expect(document.querySelector('img')).toBeNull();
    });

    it('takes at most two initials and copes with a blank name', () => {
        expect(initials('Олег Петро Іван')).toBe('ОП');
        expect(initials('   ')).toBe('?');
    });
});

describe('Button', () => {
    it('is disabled while busy and says so for assistive tech', () => {
        render(<Button busy>Go</Button>);
        const button = screen.getByRole('button') as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('forwards clicks and testids', () => {
        const onClick = vi.fn();
        render(
            <Button data-testid="go" onClick={onClick}>
                Go
            </Button>,
        );
        fireEvent.click(screen.getByTestId('go'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

describe('Sheet', () => {
    it('closes on backdrop tap and on Escape, but not on a tap inside', () => {
        const onClose = vi.fn();
        render(
            <Sheet open title="T" onClose={onClose}>
                <p>body</p>
            </Sheet>,
        );
        fireEvent.click(screen.getByText('body'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('sheet-backdrop'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('renders nothing when closed', () => {
        render(
            <Sheet open={false} onClose={() => {}}>
                <p>body</p>
            </Sheet>,
        );
        expect(screen.queryByText('body')).toBeNull();
    });
});

describe('Toast', () => {
    it('carries the reason for tests and renders nothing without a message', () => {
        const { rerender } = render(<Toast message="x" reason="NOT_YOUR_TURN" />);
        expect(screen.getByRole('alert').getAttribute('data-reason')).toBe('NOT_YOUR_TURN');
        rerender(<Toast message={undefined} />);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});

describe('Badge and ListRow', () => {
    it('render their content', () => {
        render(<Badge tone="accent">new</Badge>);
        expect(screen.getByText('new').className).toContain('accent');
        const onClick = vi.fn();
        render(<ListRow title="Title" subtitle="Sub" onClick={onClick} data-testid="row" />);
        fireEvent.click(screen.getByTestId('row'));
        expect(onClick).toHaveBeenCalled();
        expect(screen.getByText('Sub')).toBeTruthy();
    });
});

describe('Tabs and BottomNav', () => {
    it('report selections and mark the active item', () => {
        const onChange = vi.fn();
        render(
            <Tabs
                tabs={[
                    { id: 'a', label: 'A' },
                    { id: 'b', label: 'B' },
                ]}
                active="a"
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByRole('tab', { name: 'B' }));
        expect(onChange).toHaveBeenCalledWith('b');
        expect(screen.getByRole('tab', { name: 'A' }).getAttribute('aria-selected')).toBe('true');

        const onSelect = vi.fn();
        render(<BottomNav active="lobby" onSelect={onSelect} />);
        fireEvent.click(screen.getByTestId('nav-shop'));
        expect(onSelect).toHaveBeenCalledWith('shop');
        expect(screen.getByTestId('nav-lobby').getAttribute('aria-current')).toBe('page');
        expect(screen.getByTestId('nav-shop').getAttribute('aria-current')).toBeNull();
    });
});
