<template>
    <main class="api-panel">
        <section class="control-panel">
            <div class="field-group">
                <label for="path-input">Path</label>
                <input
                    id="path-input"
                    v-model="path"
                    type="text"
                    class="path-input"
                    placeholder="例如：角色.角色1.hp"
                />
            </div>

            <div class="field-group">
                <label for="scope-select">Scope</label>
                <select id="scope-select" v-model="scope" class="field-control">
                    <option value="scope">scope</option>
                    <option value="db">db</option>
                </select>
            </div>

            <div class="field-group">
                <label for="assign-input">Assign Value</label>
                <textarea
                    id="assign-input"
                    v-model="assignValue"
                    class="field-control field-textarea"
                    placeholder='例如：123 或 {"a":1}'
                />
            </div>

            <div class="field-group">
                <label for="parse-input">Parse Template</label>
                <textarea
                    id="parse-input"
                    v-model="parseTemplate"
                    class="field-control field-textarea"
                    placeholder="例如：${角色.角色1.hp}"
                />
            </div>

            <div class="action-grid">
                <button type="button" class="action-button" @click="doRead">read()</button>
                <button type="button" class="action-button" @click="doParse">parse()</button>
                <button type="button" class="action-button" @click="doAssign">assign()</button>
                <button type="button" class="action-button" @click="doSubscribe">
                    subscribe()
                </button>
                <button type="button" class="action-button" @click="showSnapshots">
                    snapshots
                </button>
                <button type="button" class="action-button" @click="showNow">EI.now</button>
                <button type="button" class="action-button" @click="clearSubs">clear subs</button>
                <button type="button" class="action-button" @click="clearLogs">clear logs</button>
            </div>
        </section>

        <section class="log-panel">
            <aside class="subscription-panel">
                <div class="subscription-heading">
                    subscribed paths ({{ subscribedPaths.length }})
                </div>
                <div v-if="subscribedPaths.length === 0" class="subscription-empty">none</div>
                <ul v-else class="subscription-list">
                    <li v-for="item in subscribedPaths" :key="item.id" class="subscription-item">
                        <span class="subscription-scope">{{ item.scope }}</span>
                        <span class="subscription-path">{{ item.path }}</span>
                    </li>
                </ul>
            </aside>

            <div ref="logEl" class="log-list">
                <article v-for="item in logs" :key="item.id" class="log-entry">
                    <div class="log-time">{{ item.time }}</div>
                    <h2 class="log-title">{{ item.title }}</h2>
                    <pre class="log-content">{{ item.content }}</pre>
                </article>
            </div>
        </section>
    </main>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

type Scope = 'scope' | 'db';

interface LogItem {
    id: number;
    time: string;
    title: string;
    content: string;
}

interface SubscriptionItem {
    id: number;
    path: string;
    scope: Scope;
}

const DESIGN_WIDTH = 1000;
const DESIGN_HEIGHT = 600;

const path = ref('角色.角色1.hp');
const scope = ref<Scope>('scope');
const assignValue = ref('123');
const parseTemplate = ref('${角色.角色1.hp}');
const logs = ref<LogItem[]>([]);
const subscribedPaths = ref<SubscriptionItem[]>([]);
const logEl = ref<HTMLDivElement | null>(null);
const status = ref<'missing' | 'ready'>('missing');
const unsubscribeFns: Array<() => void> = [];

function getEi() {
    return window.EI;
}

function formatLogContent(value: unknown) {
    try {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function addLog(title: string, value: unknown) {
    logs.value.push({
        id: Date.now() + logs.value.length,
        time: new Date().toLocaleTimeString(),
        title,
        content: formatLogContent(value),
    });

    void nextTick(() => {
        const element = logEl.value;
        if (element) {
            element.scrollTop = element.scrollHeight;
        }
    });
}

function clearSubscriptions() {
    while (unsubscribeFns.length > 0) {
        try {
            unsubscribeFns.pop()?.();
        } catch {
            // ignore unsubscribe failures from sandbox-side implementations
        }
    }
}

function parseAssignInput(raw: string) {
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

async function doRead() {
    const ei = getEi();
    if (!ei) {
        addLog('READ ERROR', 'window.EI is unavailable.');
        return;
    }

    try {
        const result = await ei.read(path.value, scope.value);
        addLog(`EI.read("${path.value}", "${scope.value}")`, result);
    } catch (error) {
        addLog('READ ERROR', String(error));
    }
}

async function doAssign() {
    const ei = getEi();
    if (!ei) {
        addLog('ASSIGN ERROR', 'window.EI is unavailable.');
        return;
    }

    try {
        const value = parseAssignInput(assignValue.value);
        await ei.assign(path.value, value, scope.value);
        addLog(`EI.assign("${path.value}") success`, value);
    } catch (error) {
        addLog('ASSIGN ERROR', String(error));
    }
}

async function doParse() {
    const ei = getEi();
    if (!ei) {
        addLog('PARSE ERROR', 'window.EI is unavailable.');
        return;
    }

    try {
        const result = await ei.parse(parseTemplate.value);
        addLog(`EI.parse(${parseTemplate.value})`, result);
    } catch (error) {
        addLog('PARSE ERROR', String(error));
    }
}

function doSubscribe() {
    const ei = getEi();
    if (!ei) {
        addLog('SUBSCRIBE ERROR', 'window.EI is unavailable.');
        return;
    }

    try {
        const subPath = path.value;
        const subScope = scope.value;
        let lastSerialized = '__INIT__';

        const unsubscribe = ei.subscribe(
            subPath,
            (value) => {
                const serialized = formatLogContent(value);
                const changed = serialized !== lastSerialized;

                addLog(
                    changed ? `SUB CHANGED: ${subPath}` : `SUB TRIGGERED (same value): ${subPath}`,
                    { changed, value },
                );

                lastSerialized = serialized;
            },
            subScope,
        );

        unsubscribeFns.push(unsubscribe);
        subscribedPaths.value.push({
            id: Date.now() + subscribedPaths.value.length,
            path: subPath,
            scope: subScope,
        });

        addLog('SUBSCRIBED', { path: subPath, scope: subScope });
    } catch (error) {
        addLog('SUBSCRIBE ERROR', String(error));
    }
}

function clearSubs() {
    clearSubscriptions();
    subscribedPaths.value = [];
    addLog('CLEAR SUBS', 'all unsubscribed');
}

function showSnapshots() {
    const ei = getEi();
    if (!ei) {
        addLog('SNAPSHOT ERROR', 'window.EI is unavailable.');
        return;
    }

    addLog('EI.localVariables', ei.localVariables);
    addLog('EI.globalVariables', ei.globalVariables);
}

function showNow() {
    const ei = getEi();
    if (!ei) {
        addLog('EI.NOW ERROR', 'window.EI is unavailable.');
        return;
    }

    addLog('EI.now', ei.now);
}

function clearLogs() {
    logs.value = [];
}

onMounted(async () => {
    const ei = getEi();
    if (!ei) {
        return;
    }

    status.value = 'ready';
    ei.setDesignSize?.(DESIGN_WIDTH, DESIGN_HEIGHT);
    await ei.ready;

    addLog('EI READY', {
        localVariables: ei.localVariables,
        globalVariables: ei.globalVariables,
        now: ei.now,
    });
});

onBeforeUnmount(() => {
    clearSubscriptions();
});
</script>

<style scoped>
.api-panel {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--ei-bg);
    color: var(--ei-fg);
    font-family: 'SFMono-Regular', 'SF Mono', Consolas, 'Liberation Mono', monospace;
}

.control-panel {
    width: 400px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-right: 1px solid var(--ei-border);
    overflow-y: auto;
}

.field-group {
    display: grid;
    gap: 8px;
}

.field-group label {
    font-size: 13px;
    font-weight: 600;
}

.path-input {
    width: 370px;
    padding: 8px 12px;
    border: 1px solid var(--ei-border);
    border-radius: 4px;
    outline: none;
    background: var(--ei-bg);
}

.field-control {
    width: 395px;
    padding: 8px 12px;
    border: 1px solid var(--ei-border);
    border-radius: 4px;
    outline: none;
    background: var(--ei-bg);
}

.field-control:focus,
.path-input:focus {
    border-color: var(--ei-fg);
}

.field-textarea {
    width: 370px;
    min-height: 100px;
    resize: vertical;
}

.action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.action-button {
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    background: var(--ei-primary);
    color: var(--ei-primary-fg);
    cursor: pointer;
}

.action-button:hover {
    opacity: 0.8;
}

.log-panel {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: var(--ei-muted);
}

.subscription-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1;
    width: 260px;
    max-height: 180px;
    padding: 8px;
    overflow-y: auto;
    background: var(--ei-muted);
    text-align: right;
}

.subscription-heading {
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--ei-muted-fg);
}

.subscription-empty {
    font-size: 12px;
    color: var(--ei-muted-fg);
}

.subscription-list {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.subscription-item {
    display: grid;
    gap: 4px;
}

.subscription-scope {
    font-size: 11px;
    color: var(--ei-muted-fg);
}

.subscription-path {
    word-break: break-all;
    font-size: 12px;
}

.log-list {
    height: 100%;
    padding: 16px 120px 16px 16px;
    overflow: auto;
}

.log-entry {
    padding: 0 0 12px;
    border-bottom: 1px solid var(--ei-border);
}

.log-entry + .log-entry {
    margin-top: 12px;
}

.log-time {
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--ei-muted-fg);
}

.log-title {
    margin: 0 0 6px;
    font-size: 14px;
}

.log-content {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.55;
}

::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-thumb {
    background: var(--ei-border);
    border-radius: 999px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

@media (max-width: 900px) {
    .api-panel {
        flex-direction: column;
    }

    .control-panel {
        width: auto;
        border-bottom: 1px solid var(--ei-border);
    }

    .subscription-panel {
        position: static;
        width: auto;
        max-height: none;
        margin: 20px 20px 0;
    }

    .log-list {
        padding: 20px;
    }
}
</style>
