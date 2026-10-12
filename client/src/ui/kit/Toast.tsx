interface Props {
    message: string | undefined;
    /** Machine-readable cause (engine reason, 'network', 'throttled', ...) exposed as data-reason for tests. */
    reason?: string | undefined;
}

export function Toast({ message, reason }: Props) {
    if (!message) {
        return null;
    }
    return (
        <p class="toast" role="alert" data-reason={reason ?? 'generic'}>
            {message}
        </p>
    );
}
