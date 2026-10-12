import { has, t } from '../i18n';

/** One sentence per engine IllegalMoveReason (cardwar.engine.IllegalMoveReason), for the rejection toast. */
export function reasonMessage(reason: string | undefined): string | undefined {
    if (reason === undefined || !has(`reason.${reason}`)) {
        return undefined;
    }
    return t(`reason.${reason}`);
}
