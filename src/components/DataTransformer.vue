<template>
    <div class="importer-container">
        <h2>数据导入/导出工具</h2>

        <div class="importer-grid">
            <div>
                <label class="importer-label">数据格式</label>
                <div class="importer-radio-group">
                    <label class="importer-radio">
                        <input v-model="format" type="radio" value="json" />
                        <span>JSON</span>
                    </label>
                    <label class="importer-radio">
                        <input v-model="format" type="radio" value="csv" />
                        <span>CSV</span>
                    </label>
                </div>
            </div>
            <div>
                <label class="importer-label">变量类型</label>
                <div class="importer-radio-group">
                    <label class="importer-radio">
                        <input v-model="scope" type="radio" value="scope" />
                        <span>沙盒变量</span>
                    </label>
                    <label class="importer-radio">
                        <input v-model="scope" type="radio" value="db" />
                        <span>全局变量</span>
                    </label>
                </div>
            </div>
        </div>

        <div class="importer-section">
            <label class="importer-label">变量名</label>
            <input
                v-model="varName"
                type="text"
                placeholder="输入变量名(不含变量/全局)"
                class="importer-input"
            />
        </div>

        <div class="importer-section">
            <label class="importer-label">数据内容</label>
            <textarea v-model="rawData" :placeholder="dataPlaceholder" class="importer-textarea" />
            <p class="importer-hint">{{ formatHint }}</p>
            <p v-if="parseError" class="importer-error">× {{ parseError }}</p>
            <p v-else-if="rawData" class="importer-success">✓ 格式有效</p>
        </div>
        <!-- 状态消息 -->
        <div
            v-if="statusMessage"
            :class="['importer-message', `importer-message-${statusMessage.type}`]"
        >
            {{ statusMessage.text }}
        </div>
        <!-- 操作按钮 -->
        <div class="importer-buttons">
            <button @click="handleImport" :disabled="!isValid || isBusy" class="importer-btn">
                <span v-if="isImporting">导入中...</span>
                <span v-else>导入数据</span>
            </button>
            <button @click="handleExport" :disabled="!canExport || isBusy" class="importer-btn">
                <span v-if="isExporting">导出中...</span>
                <span v-else>导出数据</span>
            </button>
            <button @click="reset" class="importer-btn importer-btn-secondary">重置</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { createEiAssignThrottle } from '../utils/eiRateLimit';

type Format = 'json' | 'csv';
type Scope = 'scope' | 'db';
type StatusType = 'success' | 'error';

interface StatusMessage {
    type: StatusType;
    text: string;
}

const EI_ASSIGN_VALUE_LIMIT_BYTES = 2048;
const textEncoder = new TextEncoder();

const format = ref<Format>('json');
const rawData = ref('');
const varName = ref('');
const scope = ref<Scope>('scope');
const isImporting = ref(false);
const isExporting = ref(false);
const parseError = ref('');
const statusMessage = ref<StatusMessage | null>(null);

const isValid = computed(
    () => rawData.value.trim().length > 0 && varName.value.trim().length > 0 && !parseError.value,
);
const canExport = computed(() => varName.value.trim().length > 0);
const isBusy = computed(() => isImporting.value || isExporting.value);
const dataPlaceholder = computed(() =>
    format.value === 'json'
        ? `示例:
[
  { "名称": "生命药水", "价格": 50 },
  { "名称": "法力药水", "价格": 60 }
]`
        : `示例:
名称,价格
生命药水,50
法力药水,60`,
);
const formatHint = computed(() =>
    format.value === 'json'
        ? 'JSON 导入/导出统一使用数组格式；输入单个对象时会自动包装成单行数组。'
        : 'CSV 首行为表头，导入后会转换为对象数组。',
);
const throttledAssign = createEiAssignThrottle(1000, {
    messages: {
        scheduled: '写入过快，已排队等待...',
        replaced: '待处理的写入已更新为最新值',
    },
});

/**
 * 解析 CSV 行，处理引号和逗号
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * 解析 CSV 数据为对象数组
 */
function parseCSV(text: string): unknown {
    const lines = text
        .trim()
        .split('\n')
        .filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];

    const headerLine = lines[0];
    if (!headerLine) return [];

    const headers = parseCSVLine(headerLine);
    return lines.slice(1).map((line) => {
        const values = parseCSVLine(line);
        const obj: Record<string, string> = {};
        headers.forEach((header, i) => {
            obj[header] = values[i] || '';
        });
        return obj;
    });
}

function isIdentifierStart(char: string): boolean {
    return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
    return /[A-Za-z0-9_$-]/.test(char);
}

function normalizeJsonLike(input: string): string {
    let output = '';
    let i = 0;
    let inDoubleQuote = false;
    let inSingleQuote = false;

    while (i < input.length) {
        const char = input[i];
        const nextChar = input[i + 1];

        if (inDoubleQuote) {
            if (char === '\\') {
                output += char;
                if (nextChar !== undefined) {
                    output += nextChar;
                    i += 2;
                    continue;
                }
            } else if (char === '"') {
                inDoubleQuote = false;
            }

            output += char;
            i++;
            continue;
        }

        if (inSingleQuote) {
            if (char === '\\') {
                if (nextChar === undefined) {
                    output += '\\\\';
                    i++;
                    continue;
                }

                const escapedChar = nextChar;
                switch (escapedChar) {
                    case "'":
                        output += "'";
                        break;
                    case '"':
                        output += '\\"';
                        break;
                    default:
                        output += `\\${escapedChar}`;
                        break;
                }
                i += 2;
                continue;
            }

            if (char === '"') {
                output += '\\"';
                i++;
                continue;
            }

            if (char === "'") {
                output += '"';
                inSingleQuote = false;
                i++;
                continue;
            }

            output += char;
            i++;
            continue;
        }

        if (char === '/' && nextChar === '/') {
            i += 2;
            while (i < input.length && input[i] !== '\n') {
                i++;
            }
            continue;
        }

        if (char === '/' && nextChar === '*') {
            i += 2;
            while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
                i++;
            }
            i += 2;
            continue;
        }

        if (char === '"') {
            output += char;
            inDoubleQuote = true;
            i++;
            continue;
        }

        if (char === "'") {
            output += '"';
            inSingleQuote = true;
            i++;
            continue;
        }

        if (char === '{' || char === ',') {
            output += char;
            i++;

            while (i < input.length && /\s/.test(input[i]!)) {
                output += input[i]!;
                i++;
            }

            const keyStart = input[i];
            if (!keyStart || !isIdentifierStart(keyStart)) {
                continue;
            }

            let keyEnd = i + 1;
            while (keyEnd < input.length && isIdentifierPart(input[keyEnd]!)) {
                keyEnd++;
            }

            let colonIndex = keyEnd;
            while (colonIndex < input.length && /\s/.test(input[colonIndex]!)) {
                colonIndex++;
            }

            if (input[colonIndex] === ':') {
                const key = input.slice(i, keyEnd);
                output += `"${key}"`;
                output += input.slice(keyEnd, colonIndex + 1);
                i = colonIndex + 1;
                continue;
            }

            continue;
        }

        output += char;
        i++;
    }

    return output.replace(/,\s*([}\]])/g, '$1');
}

function parseJsonLike(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return JSON.parse(normalizeJsonLike(text));
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCollectionData(data: unknown): unknown[] {
    if (Array.isArray(data)) {
        return data;
    }

    if (isPlainObject(data)) {
        return [data];
    }

    throw new Error('列表/表格变量必须传入数组；如只有一行数据，请使用 [ {...} ] 格式');
}

function getValueSizeBytes(value: unknown): number {
    return textEncoder.encode(JSON.stringify(value)).length;
}

async function assignInChunks(path: string, value: unknown, targetScope: Scope) {
    if (getValueSizeBytes(value) <= EI_ASSIGN_VALUE_LIMIT_BYTES) {
        await throttledAssign(path, value, targetScope);
        return;
    }

    if (Array.isArray(value)) {
        await throttledAssign(path, [], targetScope);

        for (const [index, item] of value.entries()) {
            await assignInChunks(`${path}.${index + 1}`, item, targetScope);
        }
        return;
    }

    if (isPlainObject(value)) {
        await throttledAssign(path, {}, targetScope);

        for (const [key, item] of Object.entries(value)) {
            await assignInChunks(`${path}.${key}`, item, targetScope);
        }
        return;
    }

    throw new Error(`存在无法拆分且超过 2KB 的值，路径 "${path}" 的当前值需要进一步压缩后再导入`);
}

function parseData(): unknown {
    const data = rawData.value.trim();

    if (!data) {
        throw new Error('数据不能为空');
    }

    switch (format.value) {
        case 'json':
            try {
                return normalizeCollectionData(parseJsonLike(data));
            } catch (err) {
                throw new Error(
                    `JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
                );
            }

        case 'csv':
            try {
                return parseCSV(data);
            } catch (err) {
                throw new Error(
                    `CSV 解析失败: ${err instanceof Error ? err.message : String(err)}`,
                );
            }

        default:
            throw new Error('不支持的数据格式');
    }
}

function stringifyCSVValue(value: unknown): string {
    const text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function toCSV(data: unknown): string {
    const normalizedData = normalizeCollectionData(data);
    if (normalizedData.length === 0) {
        return '';
    }

    const hasObjectRow = normalizedData.some(
        (item) => typeof item === 'object' && item !== null && !Array.isArray(item),
    );

    if (!hasObjectRow) {
        return ['value', ...normalizedData.map((item) => stringifyCSVValue(item))].join('\n');
    }

    const headers = Array.from(
        new Set(
            normalizedData.flatMap((item) =>
                typeof item === 'object' && item !== null && !Array.isArray(item)
                    ? Object.keys(item)
                    : ['value'],
            ),
        ),
    );

    const rows = normalizedData.map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            return headers.map((header) =>
                stringifyCSVValue((item as Record<string, unknown>)[header]),
            );
        }

        return headers.map((header) => stringifyCSVValue(header === 'value' ? item : ''));
    });

    return [headers.map(stringifyCSVValue).join(','), ...rows.map((row) => row.join(','))].join(
        '\n',
    );
}

function serializeData(data: unknown): string {
    switch (format.value) {
        case 'json':
            return JSON.stringify(normalizeCollectionData(data), null, 2);
        case 'csv':
            return toCSV(data);
        default:
            throw new Error('不支持的数据格式');
    }
}

function validateData(): boolean {
    parseError.value = '';

    try {
        parseData();
        return true;
    } catch (err) {
        parseError.value = err instanceof Error ? err.message : String(err);
        return false;
    }
}

async function handleImport() {
    // 重新验证数据
    if (!validateData()) {
        return;
    }

    if (!window.EI) {
        showStatus('error', '回声岛环境不可用');
        return;
    }

    isImporting.value = true;

    try {
        const parsedData = parseData();
        const varNameTrimmed = varName.value.trim();
        await assignInChunks(varNameTrimmed, parsedData, scope.value);

        showStatus(
            'success',
            `✓ 数据已成功写入 ${scope.value === 'scope' ? '沙盒' : '全局'}变量 "${varNameTrimmed}"`,
        );
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        showStatus('error', `导入失败: ${errMsg}`);
    } finally {
        isImporting.value = false;
    }
}

async function handleExport() {
    const varNameTrimmed = varName.value.trim();
    if (!varNameTrimmed) {
        showStatus('error', '请输入变量名');
        return;
    }

    if (!window.EI) {
        showStatus('error', '回声岛环境不可用');
        return;
    }

    isExporting.value = true;

    try {
        const data = await window.EI.read(varNameTrimmed, scope.value);
        rawData.value = serializeData(data);
        validateData();
        showStatus(
            'success',
            `✓ 已导出 ${scope.value === 'scope' ? '沙盒' : '全局'}变量 "${varNameTrimmed}"`,
        );
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        showStatus('error', `导出失败: ${errMsg}`);
    } finally {
        isExporting.value = false;
    }
}

function showStatus(type: StatusType, text: string) {
    if (window.EI?.toast) {
        window.EI.toast(text);
        statusMessage.value = null;
        return;
    }

    statusMessage.value = { type, text };
    setTimeout(() => {
        statusMessage.value = null;
    }, 3000);
}

function reset() {
    rawData.value = '';
    varName.value = '';
    scope.value = 'scope';
    format.value = 'json';
    parseError.value = '';
    statusMessage.value = null;
    isImporting.value = false;
    isExporting.value = false;
}

watch([rawData, format], () => {
    if (!rawData.value.trim()) {
        parseError.value = '';
        return;
    }

    validateData();
});
</script>

<style scoped>
.importer-container {
    width: 100%;
    max-width: 35rem;
    margin: 0 auto;
    padding: 1.5rem;
    background-color: var(--ei-bg, #ffffff);
    color: var(--ei-fg, #000000);
}

.importer-section {
    margin-bottom: 1.5rem;
}

.importer-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
}

.importer-radio-group {
    display: flex;
    gap: 1rem;
}

.importer-radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
}

.importer-radio input[type='radio'] {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
}

.importer-textarea {
    width: 100%;
    height: 10rem;
    padding: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--ei-border, #e5e7eb);
    background-color: var(--ei-bg, #ffffff);
    color: var(--ei-fg, #000000);
    font-family: monospace;
    font-size: 0.875rem;
    box-sizing: border-box;
}

.importer-textarea:focus {
    outline: none;
    box-shadow: 0 0 0 1px var(--ei-primary, #3b82f6);
}

.importer-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--ei-border, #e5e7eb);
    background-color: var(--ei-bg, #ffffff);
    color: var(--ei-fg, #000000);
    box-sizing: border-box;
}

.importer-input:focus {
    outline: none;
    box-shadow: 0 0 0 1px var(--ei-primary, #3b82f6);
}

.importer-error {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #ef4444;
}

.importer-hint {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: var(--ei-muted-fg, #6b7280);
    white-space: pre-line;
}

.importer-success {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #16a34a;
}

.importer-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 1rem;
}

.importer-buttons {
    display: flex;
    gap: 0.75rem;
}

.importer-btn {
    min-height: 2rem;
    padding: 0.625rem 1rem;
    border-radius: 0.375rem;
    border: none;
    font-weight: 500;
    font-size: 0.875rem;
    line-height: 1.2;
    cursor: pointer;
    background-color: var(--ei-primary, #3b82f6);
    color: var(--ei-primary-fg, #ffffff);
    transition:
        opacity 0.2s,
        background-color 0.2s,
        border-color 0.2s,
        color 0.2s;
}

.importer-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.importer-btn:hover:not(:disabled) {
    opacity: 0.88;
}

.importer-btn-secondary {
    background-color: var(--ei-muted, #f3f4f6);
    color: var(--ei-muted-fg, #6b7280);
    border-color: var(--ei-border, #e5e7eb);
}

.importer-message {
    margin-top: 1rem;
    padding: 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
}

.importer-message-success {
    background-color: #dcfce7;
    color: #166534;
}

.importer-message-error {
    background-color: #fee2e2;
    color: #991b1b;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
