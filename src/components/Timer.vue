<template>
    <div class="timer-container">
        <div class="time-display">{{ formattedTime }}</div>

        <div v-if="isGmViewer" class="controls">
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

<script setup>
import { ref, computed, onMounted } from 'vue';
import { createEiGmGuard } from '@/utils/eiRateLimit';

const currentTime = ref(0);
const status = ref('pause');
const isCountdown = ref(false);
const currentViewer = ref('');
let timerId = null;
let lastSyncTime = 0;

const syncTimerToSandboxByGm = createEiGmGuard(async (ei, [nextTime, nextStatus]) => {
    await ei.assign('currentTime', nextTime);
    await ei.assign('status', nextStatus);
});

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

const isGmViewer = computed(() => currentViewer.value === 'GM');

const getConfig = () => {
    const list = EI.localVariables.config;
    if (!list) return {};
    return Array.isArray(list) ? list[0] || {} : list['0'] || {};
};

const syncToSandbox = async (newStatus) => {
    if (newStatus) status.value = newStatus;
    await syncTimerToSandboxByGm(currentTime.value, status.value);
    lastSyncTime = currentTime.value;
};

const step = () => {
    if (status.value !== 'running') return;
    if (isCountdown.value) {
        if (currentTime.value > 0) currentTime.value--;
        else stop('pause');
    } else {
        currentTime.value++;
    }
    if (Math.abs(currentTime.value - lastSyncTime) >= 60) syncToSandbox();
};

const start = () => {
    if (timerId) clearInterval(timerId);
    isCountdown.value = !!getConfig().countdown;
    timerId = setInterval(step, 1000);
};

const stop = (newStatus) => {
    clearInterval(timerId);
    timerId = null;
    syncToSandbox(newStatus);
};

const toggleStatus = () => {
    if (status.value === 'running') stop('pause');
    else {
        status.value = 'running';
        syncToSandbox('running');
        start();
    }
};

const resetTime = async () => {
    const cfg = getConfig();
    const total =
        Number(cfg.initialHour || 0) * 3600 +
        Number(cfg.initialMinute || 0) * 60 +
        Number(cfg.initialSecond || 0);
    currentTime.value = total;
    isCountdown.value = !!cfg.countdown;
    if (timerId) clearInterval(timerId);
    await syncToSandbox('pause');
    EI.toast('时间已重制');
};

onMounted(() => {
    EI.onReady(() => {
        currentTime.value = Number(EI.localVariables.currentTime) || 0;
        status.value = EI.localVariables.status || 'pause';
        lastSyncTime = currentTime.value;
        EI.parse('${当前.观看者}').then((viewer) => {
            currentViewer.value = typeof viewer === 'string' ? viewer.trim() : '';
        });
        if (status.value === 'running') start();

        EI.subscribe('config.1', () => {
            if (status.value !== 'running') isCountdown.value = !!getConfig().countdown;
        });
        EI.subscribe('当前.观看者', (v) => {
            currentViewer.value = typeof v === 'string' ? v.trim() : '';
        });
        EI.subscribe('status', (v) => {
            if (v !== status.value) {
                status.value = v;
                v === 'running' ? start() : (clearInterval(timerId), (timerId = null));
            }
        });
        EI.subscribe('currentTime', (v) => {
            if (Math.abs(v - currentTime.value) > 2) {
                currentTime.value = Number(v);
                lastSyncTime = Number(v);
            }
        });
    });
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
