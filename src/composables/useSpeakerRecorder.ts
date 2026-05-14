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

function pushSpeaker(stack: string[], speaker: string) {
    stack.unshift(speaker);
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

function normalizeSpeakerTable(value: unknown) {
    if (!Array.isArray(value)) {
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
    const lastHandledSpeaker = ref('');
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

    async function syncGlobalRows() {
        const rows = buildSpeakerTable(allSpeakers.value, playerSpeakers.value, npcSpeakers.value);
        await assignSpeakerRows('发言人', rows, 'scope');
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

        pushSpeaker(allSpeakers.value, speaker);

        if (ei.now.players.includes(speaker)) {
            pushSpeaker(playerSpeakers.value, speaker);
        } else if (ei.now.npcs.includes(speaker)) {
            pushSpeaker(npcSpeakers.value, speaker);
        }

        await syncGlobalRows();
    }

    onMounted(async () => {
        const ei = window.EI;
        if (!ei) {
            status.value = 'missing-ei';
            return;
        }

        await ei.ready;
        status.value = 'ready';
        globalRows.value = buildSpeakerTable([], [], []);

        unsubscribeFns.push(
            ei.subscribe(
                '发言人',
                (value) => {
                    globalRows.value = normalizeSpeakerTable(value);
                },
                'scope',
            ),
        );

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
        globalRows,
        npcSpeakers,
        playerSpeakers,
        stackDepth,
        status,
    };
}
