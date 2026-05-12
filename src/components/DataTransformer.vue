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
            <textarea v-model="rawData" placeholder="粘贴数据内容..." class="importer-textarea" />
            <p v-if="parseError" class="importer-error">× {{ parseError }}</p>
            <p v-else-if="rawData" class="importer-success">✓ 格式有效</p>
        </div>

        <!-- 操作按钮 -->
        <div class="importer-buttons">
            <button
                @click="handleImport"
                :disabled="!isValid || isBusy"
                class="importer-btn importer-btn-primary"
            >
                <span v-if="isImporting">导入中...</span>
                <span v-else>导入数据</span>
            </button>
            <button
                @click="handleExport"
                :disabled="!canExport || isBusy"
                class="importer-btn importer-btn-secondary"
            >
                <span v-if="isExporting">导出中...</span>
                <span v-else>导出数据</span>
            </button>
            <button @click="reset" class="importer-btn importer-btn-secondary">重置</button>
        </div>

        <!-- 状态消息 -->
        <transition name="fade">
            <div
                v-if="statusMessage"
                :class="['importer-message', `importer-message-${statusMessage.type}`]"
            >
                {{ statusMessage.text }}
            </div>
        </transition>
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

function parseData(): unknown {
    const data = rawData.value.trim();

    if (!data) {
        throw new Error('数据不能为空');
    }

    switch (format.value) {
        case 'json':
            try {
                return JSON.parse(data);
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
    if (Array.isArray(data)) {
        if (data.length === 0) {
            return '';
        }

        const hasObjectRow = data.some(
            (item) => typeof item === 'object' && item !== null && !Array.isArray(item),
        );

        if (!hasObjectRow) {
            return ['value', ...data.map((item) => stringifyCSVValue(item))].join('\n');
        }

        const headers = Array.from(
            new Set(
                data.flatMap((item) =>
                    typeof item === 'object' && item !== null && !Array.isArray(item)
                        ? Object.keys(item)
                        : ['value'],
                ),
            ),
        );

        const rows = data.map((item) => {
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

    if (typeof data === 'object' && data !== null) {
        const record = data as Record<string, unknown>;
        const headers = Object.keys(record);
        if (headers.length === 0) {
            return '';
        }

        return [
            headers.map(stringifyCSVValue).join(','),
            headers.map((header) => stringifyCSVValue(record[header])).join(','),
        ].join('\n');
    }

    return ['value', stringifyCSVValue(data)].join('\n');
}

function serializeData(data: unknown): string {
    switch (format.value) {
        case 'json':
            return JSON.stringify(data, null, 2);
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

        // 使用默认节流限流
        const throttledAssign = createEiAssignThrottle(1000, {
            messages: {
                scheduled: '写入过快，已排队等待...',
                replaced: '待处理的写入已更新为最新值',
            },
        });
        await throttledAssign(varNameTrimmed, parsedData, scope.value);

        showStatus(
            'success',
            `✓ 数据已成功写入 ${scope.value === 'scope' ? '局部' : '全局'}变量 "${varNameTrimmed}"`,
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
            `✓ 已导出 ${scope.value === 'scope' ? '局部' : '全局'}变量 "${varNameTrimmed}"`,
        );
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        showStatus('error', `导出失败: ${errMsg}`);
    } finally {
        isExporting.value = false;
    }
}

function showStatus(type: StatusType, text: string) {
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

.importer-success {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #16a34a;
}

.importer-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.importer-scope {
    display: flex;
    gap: 1rem;
    padding-top: 0.5rem;
}

.importer-buttons {
    display: flex;
    gap: 0.75rem;
}

.importer-btn {
    min-height: 2.75rem;
    padding: 0.625rem 1rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    font-weight: 500;
    font-size: 0.875rem;
    line-height: 1.2;
    cursor: pointer;
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

.importer-btn-primary {
    flex: 1;
    background-color: var(--ei-primary, #3b82f6);
    color: var(--ei-primary-fg, #ffffff);
    border-color: var(--ei-primary, #3b82f6);
}

.importer-btn-primary:hover:not(:disabled) {
    opacity: 0.88;
}

.importer-btn-secondary {
    background-color: var(--ei-muted, #f3f4f6);
    color: var(--ei-muted-fg, #6b7280);
    border-color: var(--ei-border, #e5e7eb);
}

.importer-btn-secondary:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--ei-muted, #f3f4f6) 82%, var(--ei-fg, #000000) 18%);
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
