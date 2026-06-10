<template>
    <div class="container">
        <div class="input-wrapper">
            <!-- 左侧：显示内容 -->
            <div class="input-section">
                <label class="input-label">
                    <span>显示内容</span>
                    <span class="count">{{ displayContent.length }} 字</span>
                </label>
                <textarea
                    v-model="displayContent"
                    placeholder="输入要显示的内容，这些内容不会被朗读（可直接输入 Markdown / HTML 富文本）"
                    class="textarea"
                ></textarea>
            </div>

            <!-- 右侧：朗读内容 -->
            <div class="input-section">
                <label class="input-label">
                    <span>朗读内容</span>
                    <span class="count">{{ readContent.length }} 字</span>
                </label>
                <textarea
                    v-model="readContent"
                    placeholder="输入要朗读的内容，这些内容在聊天框内不会被显示，但会被朗读"
                    class="textarea"
                ></textarea>
            </div>
        </div>

        <!-- 操作按钮区 -->
        <div class="button-bar">
            <div class="info-text"></div>
            <div class="button-group">
                <button @click="fillTestData" class="btn btn-test" title="填充预设测试数据">
                    测试
                </button>
                <button
                    @click="syncFromDisplay"
                    class="btn btn-sync"
                    :disabled="!displayContent.trim()"
                >
                    一键同步
                </button>
                <button
                    @click="send"
                    class="btn btn-send"
                    :disabled="!displayContent.trim() && !readContent.trim()"
                >
                    发送
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { createEiMsgThrottle } from '../utils/eiRateLimit';

const displayContent = ref('');
const readContent = ref('');
const isSending = ref(false);

const EI = window.EI;

const sendMsg = createEiMsgThrottle(1000, {
    messages: {
        scheduled: '消息已进入队列。',
        replaced: '连续消息已合并为最后一条。',
    },
});

// 剥离 HTML tag
function stripHtml(html: string): string {
    if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    }
    // Fallback: 简单正则
    return html.replace(/<[^>]*>/g, '');
}

// 一键同步：将显示内容剥离 HTML 后同步到朗读内容
function syncFromDisplay() {
    const stripped = stripHtml(displayContent.value);
    readContent.value = stripped;
}

function fillTestData() {
    displayContent.value = `<p style="color: transparent; text-shadow: 0px 0px 2px #555555">恍惚中惊醒</p><br>地牢里的空气潮湿而冰冷——

你们并不是自愿聚在一起的，**盗贼**是因为撬锁失手被抓，**牧师**是因为调查这里的邪教集会被俘，**蛮族**则是为了寻找失踪的族人单枪匹马杀入，结果中了陷阱。`;
    readContent.value =
        '只是，后世的史学家无论如何也无法想到，那场传奇冒险故事的开端竟是如此草率。';
}

function hasMarkdownCommand(text: string): boolean {
    return text.trim().startsWith('/md ');
}

async function send() {
    if (!EI) {
        return;
    }

    if (isSending.value) return;

    if (!displayContent.value.trim() && !readContent.value.trim()) {
        return;
    }

    isSending.value = true;
    try {
        const display = displayContent.value.trim();
        const read = readContent.value.trim();

        // 确保最终消息都有 /md 指令
        const displayMsg = hasMarkdownCommand(display) ? display : `/md ${display}`;
        const readMsg = hasMarkdownCommand(read) ? read : `/md ${read}`;

        // 统一使用分发逻辑：先发送不朗读的显示内容，再发送不显示的朗读内容
        await sendInChunks(displayMsg, readMsg);

        displayContent.value = '';
        readContent.value = '';
    } catch (error) {
        console.error(error);
    } finally {
        isSending.value = false;
    }
}

// 辅助：用注释将字符串填充到 > 170 字符，保证 > 160 不朗读
function padToNotRead(s: string): string {
    const COMMENT = '<!--p-->';
    let out = s;
    while (out.length <= 170) {
        out += COMMENT;
    }
    return out;
}

// 辅助：将文本分片为指定长度
function splitToChunks(s: string, size: number): string[] {
    const res: string[] = [];
    for (let i = 0; i < s.length; i += size) {
        res.push(s.slice(i, i + size));
    }
    return res;
}

// 发送显示内容，保证每条发送的消息长度 > 170（确保不会被朗读）
async function sendDisplayAsNotRead(displayMsg: string) {
    if (!EI) throw new Error('EI 未就绪');

    // 少打空格会导致静默失败吞掉消息，直接删掉已有的指令再统一重加
    const displayText = displayMsg.replace(/^\/md\s+/, '').trim();
    if (!displayText) return;

    // 防止溢出可发送字符上限
    const CHUNK_SIZE = 1000;
    const rawChunks = splitToChunks(displayText, CHUNK_SIZE);

    for (let i = 0; i < rawChunks.length; i++) {
        let chunk = rawChunks[i];
        let msg = `/md ${chunk}`;

        if (msg.length <= 170) {
            const contentOnly = msg.replace(/^\/md\s+/, '');
            const padded = padToNotRead(contentOnly);
            msg = `/md ${padded}`;
        }

        await sendMsg(msg);
        if (i < rawChunks.length - 1) await new Promise((r) => setTimeout(r, 300));
    }
}

// 发送朗读内容：拆分为每段 <= 140 的消息，每段整体用 HTML 注释包裹（确保不显示但被朗读）
async function sendReadChunks(readMsg: string) {
    if (!EI) throw new Error('EI 未就绪');

    const readText = readMsg.replace(/^\/md\s+/, '').trim();
    if (!readText) return;

    // 每段最大 140 个字符，预留空间给 /md <!--  -->
    const MAX_READ_CHUNK = 140;
    const readChunks = splitToChunks(readText, MAX_READ_CHUNK);

    for (let i = 0; i < readChunks.length; i++) {
        const chunk = readChunks[i];
        const msg = `/md <!-- ${chunk} -->`;
        await sendMsg(msg);
        // 给朗读时间，140 字大概读 15 秒
        if (i < readChunks.length - 1) await new Promise((r) => setTimeout(r, 15000));
    }
}

// 朗读/显示消息可单独分发
async function sendInChunks(displayMsg: string, readMsg: string) {
    const displayText = displayMsg.replace(/^\/md\s+/, '').trim();
    const readText = readMsg.replace(/^\/md\s+/, '').trim();

    const hasDisplay = displayText.length > 0;
    const hasRead = readText.length > 0;

    if (hasDisplay) {
        await sendDisplayAsNotRead(displayMsg);
        // 显示消息发送后稍作延迟，不然朗读消息偶尔被吞
        if (hasRead) {
            await new Promise((r) => setTimeout(r, 100));
        }
    }
    if (hasRead) {
        await sendReadChunks(readMsg);
    }
}
</script>

<style scoped>
* {
    box-sizing: border-box;
}

.container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background-color: var(--ei-bg);
    color: var(--ei-fg);
}

.input-wrapper {
    display: flex;
    gap: 12px;
    flex: 1;
    min-height: 0;
}

.input-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
}

.input-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--ei-muted-fg);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.count {
    font-size: 11px;
}

.textarea {
    flex: 1;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--ei-border);
    background-color: var(--ei-bg);
    color: var(--ei-fg);
    resize: none;
    font-family: inherit;
    font-size: 13px;
}

.textarea:focus {
    outline: none;
    border-color: var(--ei-primary);
}

.button-bar {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
}

.info-text {
    font-size: 12px;
    color: var(--ei-muted-fg);
}

.button-group {
    display: flex;
    gap: 8px;
}

.btn {
    padding: 8px 12px;
    border-radius: 20px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn:not(:disabled):hover {
    opacity: 0.8;
}

.btn-test {
    background-color: var(--ei-muted);
    color: var(--ei-muted-fg);
}

.btn-sync {
    background-color: var(--ei-muted);
    color: var(--ei-muted-fg);
}

.btn-send {
    background-color: var(--ei-primary);
    color: var(--ei-primary-fg);
}
</style>
