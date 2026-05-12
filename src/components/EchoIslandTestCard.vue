<template>
    <section class="card">
        <div class="eyebrow">{{ title }}</div>
        <h1>Echo Island Sandbox</h1>
        <p class="summary">组件默认展示主题变量、设计尺寸布局和 `EI` 变量同步。</p>

        <dl class="status-grid">
            <div class="status-item">
                <dt>运行模式</dt>
                <dd>{{ status === 'sandbox' ? 'Sandbox / EI 已连接' : 'Browser / 本地预览' }}</dd>
            </div>
            <div class="status-item">
                <dt>当前频道</dt>
                <dd>{{ channelName }}</dd>
            </div>
        </dl>

        <div class="counter-panel">
            <span class="counter-label">计数器</span>
            <strong class="counter-value">{{ counter }}</strong>
        </div>

        <div class="actions">
            <button
                type="button"
                class="primary-button"
                :disabled="isBusy"
                @click="increaseCounter"
            >
                {{ isBusy ? '写入中...' : '+1 写入变量' }}
            </button>
            <button type="button" class="secondary-button" :disabled="isBusy" @click="resetCounter">
                重置
            </button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { createEiAssignThrottle } from '../utils/eiRateLimit';

const counter = ref(0);
const channelName = ref('未连接');
const status = ref<'browser' | 'sandbox'>('browser');
const isBusy = ref(false);
const unsubscribeFns: Array<() => void> = [];
const assignCounter = createEiAssignThrottle(1000);

const title = computed(() =>
    status.value === 'sandbox' ? '回声岛沙盒联调组件' : '本地预览测试组件',
);

function cleanupSubscriptions() {
    while (unsubscribeFns.length > 0) {
        unsubscribeFns.pop()?.();
    }
}

function getEi() {
    return window.EI;
}

async function syncCounter(nextValue: number) {
    counter.value = nextValue;

    const ei = getEi();
    if (!ei) {
        return;
    }

    isBusy.value = true;
    try {
        await assignCounter('计数器', nextValue);
    } finally {
        isBusy.value = false;
    }
}

async function increaseCounter() {
    const nextValue = counter.value + 1;
    await syncCounter(nextValue);
}

async function resetCounter() {
    await syncCounter(0);
}

onMounted(async () => {
    const ei = getEi();
    if (!ei) {
        return;
    }

    status.value = 'sandbox';
    await ei.ready;

    const initialCounter = ei.localVariables.计数器;
    counter.value = typeof initialCounter === 'number' ? initialCounter : 0;

    const currentChannel = await ei.parse('${当前.频道}');
    channelName.value =
        typeof currentChannel === 'string' && currentChannel.length > 0
            ? currentChannel
            : '未知频道';

    unsubscribeFns.push(
        ei.subscribe('计数器', (value) => {
            counter.value = typeof value === 'number' ? value : 0;
        }),
    );

    unsubscribeFns.push(
        ei.subscribe('当前.频道', (value) => {
            channelName.value = typeof value === 'string' && value.length > 0 ? value : '未知频道';
        }),
    );
});

onBeforeUnmount(() => {
    cleanupSubscriptions();
});
</script>

<style scoped>
.card {
    box-sizing: border-box;
    display: grid;
    gap: 16px;
    width: 100%;
    height: 100%;
    padding: 24px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02));
    color: var(--ei-fg, #e2e8f0);
    border: 1px solid var(--ei-border, rgb(148 163 184 / 0.28));
    border-radius: 22px;
    box-shadow: 0 18px 45px rgb(15 23 42 / 0.28);
}

.eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ei-primary, #38bdf8);
}

h1 {
    margin: 0;
    font-size: 28px;
    line-height: 1.1;
}

.summary {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ei-muted-fg, rgb(226 232 240 / 0.78));
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
}

.status-item {
    padding: 14px;
    background: var(--ei-muted, rgb(148 163 184 / 0.12));
    border-radius: 16px;
}

dt {
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--ei-muted-fg, rgb(226 232 240 / 0.72));
}

dd {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
}

.counter-panel {
    display: flex;
    align-items: end;
    justify-content: space-between;
    padding: 18px 20px;
    background: rgb(15 23 42 / 0.18);
    border: 1px solid var(--ei-border, rgb(148 163 184 / 0.28));
    border-radius: 18px;
}

.counter-label {
    font-size: 14px;
    color: var(--ei-muted-fg, rgb(226 232 240 / 0.72));
}

.counter-value {
    font-size: 48px;
    line-height: 1;
    color: var(--ei-primary, #38bdf8);
}

.actions {
    display: flex;
    gap: 12px;
}

button {
    appearance: none;
    border: 0;
    border-radius: 999px;
    padding: 12px 16px;
    font: inherit;
    cursor: pointer;
    transition:
        transform 160ms ease,
        opacity 160ms ease,
        box-shadow 160ms ease;
}

button:hover:enabled {
    transform: translateY(-1px);
}

button:disabled {
    cursor: wait;
    opacity: 0.72;
}

.primary-button {
    flex: 1;
    color: var(--ei-primary-fg, #082f49);
    background: var(--ei-primary, #38bdf8);
    box-shadow: 0 12px 24px rgb(56 189 248 / 0.24);
}

.secondary-button {
    min-width: 84px;
    color: var(--ei-fg, #e2e8f0);
    background: transparent;
    border: 1px solid var(--ei-border, rgb(148 163 184 / 0.28));
}
</style>
