<template>
    <section class="card">
        <div class="eyebrow">Echo Island Test</div>
        <h1>`EI.subscribe` 去重测试</h1>
        <p class="summary">
            这个面板同时挂载原始订阅和去重订阅。点击下面的按钮，观察“广播次数”和“真实变更次数”的差异。
        </p>

        <dl class="status-grid">
            <div class="status-item">
                <dt>运行模式</dt>
                <dd>{{ statusLabel }}</dd>
            </div>
            <div class="status-item">
                <dt>测试路径</dt>
                <dd>{{ watchedPath }}</dd>
            </div>
            <div class="status-item">
                <dt>当前值</dt>
                <dd>{{ currentValue }}</dd>
            </div>
            <div class="status-item">
                <dt>上次广播值</dt>
                <dd>{{ lastRawValue }}</dd>
            </div>
        </dl>

        <div class="stats-grid">
            <article class="stat-card">
                <span class="stat-label">原始订阅触发次数</span>
                <strong class="stat-value">{{ rawTriggerCount }}</strong>
            </article>
            <article class="stat-card accent">
                <span class="stat-label">去重后触发次数</span>
                <strong class="stat-value">{{ distinctTriggerCount }}</strong>
            </article>
        </div>

        <div class="actions">
            <button type="button" class="primary-button" :disabled="isBusy" @click="increaseCounter">
                {{ isBusy ? '写入中...' : '计数器 +1' }}
            </button>
            <button type="button" class="secondary-button" :disabled="isBusy" @click="writeNoise">
                写入其他变量
            </button>
            <button type="button" class="secondary-button" :disabled="isBusy" @click="resetTest">
                重置
            </button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { createEiAssignThrottle } from '@/utils/eiRateLimit';
import { subscribeEiDistinct } from '@/utils/eiSubscribe';

const watchedPath = '计数器';

const status = ref<'browser' | 'sandbox'>('browser');
const currentValue = ref(0);
const lastRawValue = ref('未收到');
const rawTriggerCount = ref(0);
const distinctTriggerCount = ref(0);
const noiseSeed = ref(0);
const isBusy = ref(false);
const unsubscribeFns: Array<() => void> = [];

const assignThrottle = createEiAssignThrottle(1000);

const statusLabel = computed(() =>
    status.value === 'sandbox' ? 'Sandbox / EI 已连接' : 'Browser / 本地预览',
);

function cleanupSubscriptions() {
    while (unsubscribeFns.length > 0) {
        unsubscribeFns.pop()?.();
    }
}

function getEi() {
    return window.EI;
}

function formatValue(value: unknown) {
    if (value === undefined) {
        return 'undefined';
    }

    return typeof value === 'string' ? value : JSON.stringify(value);
}

async function assignValue(path: string, value: unknown) {
    if (!getEi()) {
        return;
    }

    isBusy.value = true;
    try {
        await assignThrottle(path, value);
    } finally {
        isBusy.value = false;
    }
}

async function increaseCounter() {
    await assignValue(watchedPath, currentValue.value + 1);
}

async function writeNoise() {
    // 故意写入别的变量，用来验证原始 subscribe 会被广播误触发。
    noiseSeed.value += 1;
    await assignValue('测试噪音', `noise-${noiseSeed.value}`);
}

async function resetTest() {
    rawTriggerCount.value = 0;
    distinctTriggerCount.value = 0;
    lastRawValue.value = '未收到';
    await assignValue(watchedPath, 0);
    await assignValue('测试噪音', 'reset');
}

onMounted(async () => {
    const ei = getEi();
    if (!ei) {
        return;
    }

    status.value = 'sandbox';
    await ei.ready;

    const initialCounter = ei.localVariables[watchedPath];
    currentValue.value = typeof initialCounter === 'number' ? initialCounter : 0;

    // 原始订阅用于观察 EI.subscribe 的实际广播次数。
    unsubscribeFns.push(
        ei.subscribe(watchedPath, (value) => {
            rawTriggerCount.value += 1;
            lastRawValue.value = formatValue(value);
        }),
    );

    // 去重订阅只在 watchedPath 的值真的变化时才推进业务状态。
    unsubscribeFns.push(
        subscribeEiDistinct<number>(watchedPath, (value) => {
            distinctTriggerCount.value += 1;
            currentValue.value = typeof value === 'number' ? value : 0;
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
    background:
        radial-gradient(circle at top right, rgb(34 197 94 / 0.14), transparent 32%),
        linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.02));
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

.status-grid,
.stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
}

.status-item,
.stat-card {
    display: grid;
    gap: 8px;
    padding: 14px;
    background: var(--ei-muted, rgb(148 163 184 / 0.12));
    border-radius: 16px;
}

.accent {
    background: rgb(34 197 94 / 0.14);
    border: 1px solid rgb(34 197 94 / 0.26);
}

dt,
.stat-label {
    font-size: 12px;
    color: var(--ei-muted-fg, rgb(226 232 240 / 0.72));
}

dd,
.stat-value {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.1;
}

.actions {
    display: flex;
    flex-wrap: wrap;
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
    color: var(--ei-primary-fg, #082f49);
    background: var(--ei-primary, #38bdf8);
    box-shadow: 0 12px 24px rgb(56 189 248 / 0.24);
}

.secondary-button {
    color: var(--ei-fg, #e2e8f0);
    background: transparent;
    border: 1px solid var(--ei-border, rgb(148 163 184 / 0.28));
}
</style>
