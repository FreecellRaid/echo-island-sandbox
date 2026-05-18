import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { createEiAssignThrottle } from '@/utils/eiRateLimit';

const STACK_LIMIT = 10;
const EMPTY_SPEAKER = '??';

type SpeakerTableRow = {
    all: string;
    pl: string;
    npc: string;
};

function normalizeSpeaker(value: unknown) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function insertSpeakerDeduped(stack: string[], speaker: string) {
    const nextStack = stack.filter((item) => item !== speaker);
    nextStack.unshift(speaker);
    stack.splice(0, stack.length, ...nextStack);

    if (stack.length > STACK_LIMIT) {
        stack.length = STACK_LIMIT;
    }
}

function buildSpeakerTable(
    allStack: string[],
    playerStack: string[],
    npcStack: string[],
): SpeakerTableRow[] {
    return Array.from({ length: STACK_LIMIT }, (_value, index) => ({
        all: allStack[index] ?? EMPTY_SPEAKER,
        pl: playerStack[index] ?? EMPTY_SPEAKER,
        npc: npcStack[index] ?? EMPTY_SPEAKER,
    }));
}

// 避免非法值，重制变量
function normalizeSpeakerTable(value: unknown): SpeakerTableRow[] {
    if (!value || !Array.isArray(value)) {
        return buildSpeakerTable([], [], []);
    }

    return Array.from({ length: STACK_LIMIT }, (_entry, index) => {
        const row = value[index];
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return {
                all: EMPTY_SPEAKER,
                pl: EMPTY_SPEAKER,
                npc: EMPTY_SPEAKER,
            };
        }

        const typedRow = row as Partial<SpeakerTableRow>;
        return {
            all: typeof typedRow.all === 'string' && typedRow.all ? typedRow.all : EMPTY_SPEAKER,
            pl: typeof typedRow.pl === 'string' && typedRow.pl ? typedRow.pl : EMPTY_SPEAKER,
            npc: typeof typedRow.npc === 'string' && typedRow.npc ? typedRow.npc : EMPTY_SPEAKER,
        };
    });
}

export function useSpeakerRecorder() {
    const status = ref<'idle' | 'ready' | 'missing-ei'>('idle');
    const currentSpeaker = ref(EMPTY_SPEAKER);
    const currentViewer = ref(EMPTY_SPEAKER);
    const lastHandledSpeaker = ref('');

    // 这三个栈现在作为组件本地 UI 的纯粹展示（只由线上同步过来的数据驱动）
    const allSpeakers = ref<string[]>([]);
    const playerSpeakers = ref<string[]>([]);
    const npcSpeakers = ref<string[]>([]);

    const globalRows = ref<SpeakerTableRow[]>(buildSpeakerTable([], [], []));
    const unsubscribeFns: Array<() => void> = [];
    const assignSpeakerRows = createEiAssignThrottle(1000, {
        messages: {
            missingEi: 'EI 未连接，无法同步发言者记录。',
        },
    });

    const stackDepth = computed(() => allSpeakers.value.length);

    function cleanupSubscriptions() {
        while (unsubscribeFns.length > 0) {
            unsubscribeFns.pop()?.();
        }
    }

    function applyRowsToLocalState(rows: SpeakerTableRow[]) {
        globalRows.value = rows;
        allSpeakers.value = rows.map((row) => row.all).filter((value) => value && value !== EMPTY_SPEAKER);
        playerSpeakers.value = rows.map((row) => row.pl).filter((value) => value && value !== EMPTY_SPEAKER);
        npcSpeakers.value = rows.map((row) => row.npc).filter((value) => value && value !== EMPTY_SPEAKER);
    }

    // 仅本次发言者对应的观看者可写
    function canWriteSpeakerRecord(speaker: string, ei: NonNullable<Window['EI']>) {
        const viewer = currentViewer.value;
        if (!viewer || viewer === EMPTY_SPEAKER) {
            return false;
        }

        if (ei.now.players.includes(speaker)) {
            return speaker === viewer;
        }

        return viewer === 'GM';
    }

    async function syncGlobalRows(previousRows: SpeakerTableRow[], nextRows: SpeakerTableRow[]) {
        const hasChanges = nextRows.some(
            (row, index) =>
                row.all !== previousRows[index]?.all ||
                row.pl !== previousRows[index]?.pl ||
                row.npc !== previousRows[index]?.npc,
        );

        if (!hasChanges) {
            return;
        }

        await assignSpeakerRows('发言人', nextRows, 'scope');
    }

    async function handleSpeakerChange(nextValue: unknown) {
        const speaker = normalizeSpeaker(nextValue);
        if (!speaker || speaker === lastHandledSpeaker.value) {
            return;
        }

        const ei = window.EI;
        if (!ei) {
            status.value = 'missing-ei';
            return;
        }

        lastHandledSpeaker.value = speaker;
        currentSpeaker.value = speaker;

        // 非负责人只更新本地高亮，不写入
        if (!canWriteSpeakerRecord(speaker, ei)) {
            return;
        }

        // 写之前先读最新的服务器数据
        const rawOnlineRows = await ei.read('发言人', 'scope');
        const onlineRows = normalizeSpeakerTable(rawOnlineRows);

        const activeAll = onlineRows.map((r) => r.all).filter((x) => x && x !== EMPTY_SPEAKER);
        const activePl = onlineRows.map((r) => r.pl).filter((x) => x && x !== EMPTY_SPEAKER);
        const activeNpc = onlineRows.map((r) => r.npc).filter((x) => x && x !== EMPTY_SPEAKER);

        // 兼容无卡的 gm ,All的写入不依赖ei.now
        insertSpeakerDeduped(activeAll, speaker);

        if (ei.now.players.includes(speaker)) {
            insertSpeakerDeduped(activePl, speaker);
        } else if (ei.now.npcs.includes(speaker)) {
            insertSpeakerDeduped(activeNpc, speaker);
        }

        const nextRows = buildSpeakerTable(activeAll, activePl, activeNpc);

        // 单次整表写回，避免拆成多次 assign 撞上 throttle
        await syncGlobalRows(onlineRows, nextRows);
    }

    onMounted(async () => {
        const ei = window.EI;
        if (!ei) {
            status.value = 'missing-ei';
            return;
        }

        await ei.ready;
        status.value = 'ready';

        // 静态获取一次，不监听变动，防止发言者首次赋值快于观看者导致写入失败
        currentViewer.value = normalizeSpeaker(await ei.parse('${当前.观看者}')) || EMPTY_SPEAKER;

        unsubscribeFns.push(
            ei.subscribe(
                '发言人',
                (value) => {
                    const parsedRows = normalizeSpeakerTable(value);
                    applyRowsToLocalState(parsedRows);
                },
                'scope',
            ),
        );

        // 监听发言人
        unsubscribeFns.push(
            ei.subscribe('当前.发言者', (value) => {
                void handleSpeakerChange(value);
            }),
        );
    });

    onBeforeUnmount(() => {
        cleanupSubscriptions();
    });

    return {
        allSpeakers,
        currentSpeaker,
        currentViewer,
        globalRows,
        npcSpeakers,
        playerSpeakers,
        stackDepth,
        status,
    };
}
