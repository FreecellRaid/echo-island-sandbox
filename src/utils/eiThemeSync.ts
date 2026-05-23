import { createEiDebounce, createEiThrottle } from './eiRateLimit';

type Scope = 'scope' | 'db';
type Theme = 'light' | 'dark';

interface EiThemeSyncOptions {
    path?: string;
    scope?: Scope;
    debounceMs?: number;
    throttleMs?: number;
}

function isTheme(value: unknown): value is Theme {
    return value === 'light' || value === 'dark';
}

function readClientTheme(): Theme {
    if (isTheme(window.EI?.theme)) {
        return window.EI.theme;
    }

    // <html> 会随主题切换 dark 类，这里作为 EI.theme 不可用时的兜底。
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function installEiThemeSync(options: EiThemeSyncOptions = {}) {
    const { path = 'theme', scope = 'scope', debounceMs = 250, throttleMs = 1000 } = options;

    const ei = window.EI;
    if (!ei) {
        return () => undefined;
    }

    let stopped = false;
    let lastDetectedTheme: Theme | null = null;
    let lastAssignedTheme: Theme | null = null;

    const writeTheme = createEiThrottle(async (runtimeEi, [theme, force]: [Theme, boolean]) => {
        if (stopped) {
            return;
        }

        // 只在真实变化时写入；force 仅用于首次对齐状态。
        if (!force && theme === lastAssignedTheme) {
            return;
        }

        await runtimeEi.assign(path, theme, scope);
        lastAssignedTheme = theme;
    }, throttleMs);

    const scheduleWrite = createEiDebounce(async (_runtimeEi, [theme, force]: [Theme, boolean]) => {
        await writeTheme(theme, force);
    }, debounceMs);

    const syncTheme = (force = false) => {
        if (stopped) {
            return;
        }

        const nextTheme = readClientTheme();
        // 主题信号可能被重复触发，先在本地做一层去重。
        if (!force && nextTheme === lastDetectedTheme) {
            return;
        }

        lastDetectedTheme = nextTheme;
        void scheduleWrite(nextTheme, force);
    };

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleThemeSignal = () => {
        syncTheme();
    };

    const observer = new MutationObserver((mutationList) => {
        const hasThemeRelatedChange = mutationList.some(
            (mutation) => mutation.type === 'attributes' && mutation.attributeName === 'class',
        );

        if (hasThemeRelatedChange) {
            handleThemeSignal();
        }
    });

    const start = async () => {
        await ei.ready;
        if (stopped) {
            return;
        }

        const currentTheme = readClientTheme();
        lastDetectedTheme = currentTheme;

        try {
            const existingTheme = await ei.read(path, scope);
            if (isTheme(existingTheme)) {
                lastAssignedTheme = existingTheme;
            }
        } catch {
            // Ignore read failures and rely on the next assign attempt.
        }

        if (currentTheme !== lastAssignedTheme) {
            await writeTheme(currentTheme, true);
        }

        // 主题切换会反映到 <html class="dark">，这里监听类名变化。
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });

        // 某些环境下主题变更可能先从系统偏好发出，再同步到页面。
        mediaQuery?.addEventListener?.('change', handleThemeSignal);
    };

    void start();

    return () => {
        stopped = true;
        observer.disconnect();
        mediaQuery?.removeEventListener?.('change', handleThemeSignal);
    };
}
