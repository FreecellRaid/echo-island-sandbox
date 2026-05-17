<template>
    <main class="speaker-recorder-panel">
        <section class="hero-card">
            <div class="hero-copy">
                <p class="eyebrow">Speaker Recorder</p>
                <h1>发言者记录器联调面板</h1>
                <p class="summary">
                    订阅 `当前.发言者`，维护长度为 10 的发言者栈，并同步 `全局.发言者`。
                </p>
            </div>

            <dl class="meta-grid">
                <div class="meta-item">
                    <dt>连接状态</dt>
                    <dd>{{ statusLabel }}</dd>
                </div>
                <div class="meta-item">
                    <dt>当前发言者</dt>
                    <dd>{{ currentSpeaker }}</dd>
                </div>
                <div class="meta-item">
                    <dt>当前观看者</dt>
                    <dd>{{ currentViewer }}</dd>
                </div>
                <div class="meta-item">
                    <dt>全部栈深度</dt>
                    <dd>{{ stackDepth }}/10</dd>
                </div>
            </dl>

            <div v-if="mockSpeakers.length > 0 || mockViewers.length > 0" class="simulator">
                <span class="simulator-label">Mock 切换</span>
                <div v-if="mockViewers.length > 0" class="simulator-block">
                    <span class="simulator-subtitle">观看者</span>
                    <div class="simulator-actions">
                        <button
                            v-for="viewer in mockViewers"
                            :key="viewer"
                            type="button"
                            class="simulator-button simulator-button-secondary"
                            @click="setMockViewer(viewer)"
                        >
                            {{ viewer }}
                        </button>
                    </div>
                </div>
                <div class="simulator-block">
                    <span class="simulator-subtitle">发言者</span>
                    <div class="simulator-actions">
                        <button
                            v-for="speaker in mockSpeakers"
                            :key="speaker"
                            type="button"
                            class="simulator-button"
                            @click="setMockSpeaker(speaker)"
                        >
                            {{ speaker }}
                        </button>
                    </div>
                </div>
            </div>
        </section>

        <section class="content-grid">
            <article class="panel-card">
                <header class="panel-header">
                    <h2>内部栈</h2>
                </header>
                <div class="stack-grid">
                    <div class="stack-column">
                        <h3>全部</h3>
                        <ol>
                            <li v-for="(speaker, index) in filledAllSpeakers" :key="`all-${index}`">
                                {{ speaker }}
                            </li>
                        </ol>
                    </div>
                    <div class="stack-column">
                        <h3>玩家</h3>
                        <ol>
                            <li
                                v-for="(speaker, index) in filledPlayerSpeakers"
                                :key="`player-${index}`"
                            >
                                {{ speaker }}
                            </li>
                        </ol>
                    </div>
                    <div class="stack-column">
                        <h3>NPC</h3>
                        <ol>
                            <li v-for="(speaker, index) in filledNpcSpeakers" :key="`npc-${index}`">
                                {{ speaker }}
                            </li>
                        </ol>
                    </div>
                </div>
            </article>

            <article class="panel-card">
                <header class="panel-header">
                    <h2>全局.发言人</h2>
                </header>
                <div class="table-shell">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>全部</th>
                                <th>玩家</th>
                                <th>npc</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(row, index) in globalRows" :key="`row-${index}`">
                                <td>{{ index + 1 }}</td>
                                <td>{{ row.all }}</td>
                                <td>{{ row.pl }}</td>
                                <td>{{ row.npc }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </article>
        </section>
    </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSpeakerRecorder } from '@/composables/useSpeakerRecorder';

const {
    allSpeakers,
    currentSpeaker,
    currentViewer,
    globalRows,
    npcSpeakers,
    playerSpeakers,
    stackDepth,
    status,
} = useSpeakerRecorder();

const EMPTY_SPEAKER = '??';
const STACK_LIMIT = 10;

function fillStack(stack: string[]) {
    return Array.from({ length: STACK_LIMIT }, (_value, index) => stack[index] ?? EMPTY_SPEAKER);
}

const filledAllSpeakers = computed(() => fillStack(allSpeakers.value));
const filledPlayerSpeakers = computed(() => fillStack(playerSpeakers.value));
const filledNpcSpeakers = computed(() => fillStack(npcSpeakers.value));

const statusLabel = computed(() => {
    if (status.value === 'ready') {
        return 'EI 已连接';
    }

    if (status.value === 'missing-ei') {
        return 'EI 不可用';
    }

    return '初始化中';
});

const mockSpeakers = computed(() => {
    const speakerList = window.EI?.now.all ?? [];
    return [...speakerList, '神秘人'];
});

const mockViewers = computed(() => {
    const players = window.EI?.now.players ?? [];
    return [...players, 'GM'];
});

function setMockSpeaker(speaker: string) {
    window.__EI_MOCK__?.setCurrentSpeaker(speaker);
}

function setMockViewer(viewer: string) {
    window.__EI_MOCK__?.setCurrentViewer(viewer);
}
</script>

<style scoped>
.speaker-recorder-panel {
    box-sizing: border-box;
    min-height: 100%;
    padding: 28px;
    background:
        radial-gradient(circle at top left, rgb(245 158 11 / 0.2), transparent 34%),
        radial-gradient(circle at top right, rgb(14 165 233 / 0.18), transparent 30%),
        linear-gradient(160deg, rgb(8 15 28), rgb(17 24 39) 52%, rgb(26 32 44));
    color: var(--ei-fg, #f8fafc);
}

.hero-card,
.panel-card {
    border: 1px solid rgb(148 163 184 / 0.18);
    background: rgb(15 23 42 / 0.72);
    backdrop-filter: blur(16px);
    box-shadow: 0 24px 60px rgb(2 6 23 / 0.3);
}

.hero-card {
    display: grid;
    gap: 20px;
    padding: 24px;
    border-radius: 28px;
}

.eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgb(125 211 252);
}

h1,
h2,
h3,
p {
    margin: 0;
}

h1 {
    font-size: clamp(28px, 4vw, 40px);
    line-height: 1.02;
}

.summary {
    margin-top: 8px;
    max-width: 68ch;
    color: rgb(226 232 240 / 0.82);
    line-height: 1.6;
}

.meta-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin: 0;
}

.meta-item,
.stack-column,
.table-shell,
.simulator {
    border-radius: 20px;
    background: rgb(30 41 59 / 0.6);
    border: 1px solid rgb(148 163 184 / 0.14);
}

.meta-item {
    padding: 16px;
}

dt {
    margin-bottom: 10px;
    font-size: 12px;
    color: rgb(191 219 254 / 0.72);
}

dd {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
}

.simulator {
    display: grid;
    gap: 12px;
    padding: 16px;
}

.simulator-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(253 224 71 / 0.82);
}

.simulator-block {
    display: grid;
    gap: 10px;
}

.simulator-subtitle {
    font-size: 13px;
    color: rgb(226 232 240 / 0.7);
}

.simulator-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.simulator-button {
    appearance: none;
    border: 0;
    border-radius: 999px;
    padding: 10px 14px;
    background: linear-gradient(135deg, rgb(245 158 11), rgb(249 115 22));
    color: rgb(17 24 39);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition:
        transform 160ms ease,
        filter 160ms ease;
}

.simulator-button:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
}

.simulator-button-secondary {
    background: linear-gradient(135deg, rgb(56 189 248), rgb(59 130 246));
    color: rgb(8 15 28);
}

.content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 18px;
    margin-top: 18px;
}

.panel-card {
    padding: 22px;
    border-radius: 24px;
}

.panel-header {
    margin-bottom: 18px;
}

.panel-header h2 {
    font-size: 18px;
}

.stack-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
}

.stack-column {
    padding: 16px;
}

.stack-column h3 {
    margin-bottom: 12px;
    font-size: 14px;
    color: rgb(125 211 252);
}

ol {
    margin: 0;
    padding-left: 22px;
    display: grid;
    gap: 8px;
    color: rgb(226 232 240 / 0.86);
}

.table-shell {
    overflow: hidden;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th,
td {
    padding: 12px 14px;
    text-align: left;
    border-bottom: 1px solid rgb(148 163 184 / 0.12);
}

th {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgb(191 219 254 / 0.78);
}

tbody tr:last-child td {
    border-bottom: 0;
}

tbody td:first-child {
    color: rgb(148 163 184);
    width: 44px;
}

@media (max-width: 960px) {
    .speaker-recorder-panel {
        padding: 18px;
    }

    .meta-grid,
    .content-grid,
    .stack-grid {
        grid-template-columns: 1fr;
    }
}
</style>
