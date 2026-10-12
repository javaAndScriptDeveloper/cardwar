import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

interface Props {
    open: boolean;
    title?: string;
    onClose: () => void;
    children: ComponentChildren;
}

/** A bottom sheet, the mobile way to pick from a few options. Backdrop tap and Escape close it. */
export function Sheet({ open, title, onClose, children }: Props) {
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) {
        return null;
    }
    return (
        <div class="sheet-backdrop" data-testid="sheet-backdrop" onClick={onClose}>
            <div class="sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                {title && <h2>{title}</h2>}
                {children}
            </div>
        </div>
    );
}
