<template>
    <div class="timer-container">
        <div class="time-display">{{ formattedTime }}</div>

        <div class="controls">
            <button
                @click="toggleStatus"
                class="icon-btn btn-toggle"
                :class="{ running: status === 'running' }"
            >
                <svg
                    v-if="status !== 'running'"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <svg
                    v-else
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
            </button>

            <button @click="resetTime" class="icon-btn btn-reset" title="重制时间">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                </svg>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';

type TimerStatus = 'pause' | 'running';

interface TimerConfig {
    countdown?: boolean;
    initialHour?: number | string;
    initialMinute?: number | string;
    initialSecond?: number | string;
}

const currentTime = ref(0);
const status = ref<TimerStatus>('pause');
const isCountdown = ref(false);
let baseTime = 0;
let startedAt = 0;
let timerId: ReturnType<typeof window.setInterval> | null = null;
const unsubscribeFns: Array<() => void> = [];

const startTimerInSandbox = async (nextStartedAt: number) => {
    const ei = window.EI;
    if (!ei) return;

    await ei.assign('timestamp', nextStartedAt);
    await ei.assign('status', 'running');
};

const stopTimerInSandbox = async (nextTime: number, nextStatus: TimerStatus) => {
    const ei = window.EI;
    if (!ei) return;

    await ei.assign('status', nextStatus);
    await ei.assign('currentTime', nextTime);
};

const formattedTime = computed(() => {
    const absSec = Math.abs(currentTime.value);
    const h = Math.floor(absSec / 3600)
        .toString()
        .padStart(2, '0');
    const m = Math.floor((absSec % 3600) / 60)
        .toString()
        .padStart(2, '0');
    const s = (absSec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
});

const getConfig = (): TimerConfig => {
    const list = window.EI?.localVariables.config;
    if (!list) return {};
    const config = Array.isArray(list)
        ? list[0]
        : typeof list === 'object'
          ? (list as Record<string, unknown>)['0']
          : undefined;
    return config && typeof config === 'object' ? (config as TimerConfig) : {};
};

const readNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const readStatus = (value: unknown): TimerStatus => (value === 'running' ? 'running' : 'pause');

const calculateCurrentTime = (now = Date.now()) => {
    if (status.value !== 'running' || startedAt <= 0) return baseTime;

    const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
    return isCountdown.value ? Math.max(0, baseTime - elapsedSeconds) : baseTime + elapsedSeconds;
};

const refreshCurrentTime = () => {
    currentTime.value = calculateCurrentTime();
};

const stopTicker = () => {
    if (timerId === null) return;
    window.clearInterval(timerId);
    timerId = null;
};

const startTicker = () => {
    stopTicker();
    isCountdown.value = !!getConfig().countdown;
    refreshCurrentTime();
    timerId = window.setInterval(refreshCurrentTime, 250);
};

const pause = async () => {
    const pausedTime = calculateCurrentTime();
    stopTicker();
    baseTime = pausedTime;
    currentTime.value = pausedTime;
    status.value = 'pause';
    await stopTimerInSandbox(pausedTime, 'pause');
};

const start = async () => {
    baseTime = currentTime.value;
    startedAt = Date.now();
    status.value = 'running';
    startTicker();
    await startTimerInSandbox(startedAt);
};

const toggleStatus = async () => {
    if (status.value === 'running') await pause();
    else await start();
};

const resetTime = async () => {
    const cfg = getConfig();
    const total =
        Number(cfg.initialHour || 0) * 3600 +
        Number(cfg.initialMinute || 0) * 60 +
        Number(cfg.initialSecond || 0);
    stopTicker();
    baseTime = total;
    currentTime.value = total;
    isCountdown.value = !!cfg.countdown;
    status.value = 'pause';
    await stopTimerInSandbox(total, 'pause');
    window.EI?.toast('时间已重制');
};

onMounted(() => {
    window.EI?.onReady(() => {
        const ei = window.EI;
        if (!ei) return;

        baseTime = readNumber(ei.localVariables.currentTime);
        startedAt = readNumber(ei.localVariables.timestamp);
        currentTime.value = baseTime;
        status.value = readStatus(ei.localVariables.status);
        isCountdown.value = !!getConfig().countdown;

        if (status.value === 'running') startTicker();

        unsubscribeFns.push(
            ei.subscribe('config.1', () => {
                if (status.value !== 'running') isCountdown.value = !!getConfig().countdown;
            }),
        );
        unsubscribeFns.push(
            ei.subscribe('timestamp', (value) => {
                startedAt = readNumber(value);
                if (status.value === 'running') refreshCurrentTime();
            }),
        );
        unsubscribeFns.push(
            ei.subscribe('status', (value) => {
                const nextStatus = readStatus(value);
                if (nextStatus === status.value) return;

                status.value = nextStatus;
                if (nextStatus === 'running') startTicker();
                else stopTicker();
            }),
        );
        unsubscribeFns.push(
            ei.subscribe('currentTime', (value) => {
                baseTime = readNumber(value);
                refreshCurrentTime();
            }),
        );
    });
});

onBeforeUnmount(() => {
    stopTicker();
    while (unsubscribeFns.length > 0) unsubscribeFns.pop()?.();
});
</script>

<style scoped>
.timer-container {
    display: flex;
    align-items: center;
    gap: 15px;
}

.time-display {
    font-size: 48px;
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    min-width: 210px;
    font-variant-numeric: tabular-nums;
    color: var(--ei-fg);
}
.controls {
    display: flex;
    flex-direction: column;
}

/* 图标按钮基础样式 */
.icon-btn {
    cursor: pointer;
    border: none;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0;
}

/* 播放/暂停按钮 */
.btn-toggle {
    background-color: transparent;
    color: var(--ei-muted-fg);
}
.btn-toggle:hover {
    color: var(--ei-fg);
    transform: scale(1.05);
}

/* 重制按钮 */
.btn-reset {
    background-color: transparent;
    color: var(--ei-muted-fg);
}
.btn-reset:hover {
    color: var(--ei-fg);
    transform: scale(1.05);
}

svg {
    width: 20px;
    height: 20px;
    stroke-width: 2.5;
}
</style>
