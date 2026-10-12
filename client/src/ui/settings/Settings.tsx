import { t } from '../../i18n';
import { settings, updateSettings, type Settings as SettingsValue } from '../../state/settings';

const KEYS: (keyof SettingsValue)[] = ['sound', 'music', 'haptics', 'swipe', 'reducedMotion'];

/** Device preferences; each toggle writes through the settings signal, so the game reacts at once. */
export function Settings() {
    const current = settings.value;
    return (
        <section class="lobby" data-testid="settings-screen">
            <h1>{t('settings.title')}</h1>
            <div class="panel">
                {KEYS.map((key) => (
                    <label key={key} class="toggle">
                        <span>{t(`settings.${key}`)}</span>
                        <input
                            type="checkbox"
                            data-testid={`setting-${key}`}
                            checked={current[key]}
                            onChange={(event) => updateSettings({ [key]: event.currentTarget.checked })}
                        />
                    </label>
                ))}
            </div>
        </section>
    );
}
