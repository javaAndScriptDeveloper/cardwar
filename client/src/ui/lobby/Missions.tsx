import { useState } from 'preact/hooks';
import type { MissionView } from '../../api/types';
import { has, t } from '../../i18n';
import { Badge, Button, CoinAmount } from '../kit';

interface Props {
    missions: MissionView[];
    onClaim: (code: string) => Promise<void>;
}

/** The mission's sentence; a code the catalog does not know (a newer server) shows as itself. */
export function missionTitle(code: string): string {
    return has(`missions.${code}`) ? t(`missions.${code}`) : code;
}

/** Today's three missions with a bar each; the claim button appears only once a mission is complete and unpaid. */
export function Missions({ missions, onClaim }: Props) {
    const [busy, setBusy] = useState<string>();
    const claim = async (code: string) => {
        setBusy(code);
        try {
            await onClaim(code);
        } finally {
            setBusy(undefined);
        }
    };

    return (
        <div class="panel missions" data-testid="missions">
            <span class="title">{t('missions.title')}</span>
            {missions.map((mission) => {
                const complete = mission.progress >= mission.target;
                return (
                    <div
                        key={mission.code}
                        class={`mission-row${mission.claimed ? ' claimed' : ''}`}
                        data-testid="mission-row"
                        data-code={mission.code}
                        data-progress={mission.progress}
                        data-claimed={String(mission.claimed)}
                    >
                        <div class="mission-text">
                            <span class="mission-title">{missionTitle(mission.code)}</span>
                            <div class="bar" aria-hidden="true">
                                <i
                                    class="fill"
                                    style={{
                                        width: `${Math.min(100, Math.round((100 * mission.progress) / mission.target))}%`,
                                    }}
                                />
                            </div>
                            <span class="notice">
                                {mission.progress}/{mission.target}
                            </span>
                        </div>
                        {mission.claimed ? (
                            <Badge tone="success">{t('missions.claimed')}</Badge>
                        ) : complete ? (
                            <Button
                                variant="primary"
                                busy={busy === mission.code}
                                disabled={busy !== undefined}
                                onClick={() => void claim(mission.code)}
                                data-testid={`claim-${mission.code}`}
                            >
                                {t('missions.claim')} <CoinAmount amount={mission.reward} signed />
                            </Button>
                        ) : (
                            <CoinAmount amount={mission.reward} signed class="mission-reward" />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
