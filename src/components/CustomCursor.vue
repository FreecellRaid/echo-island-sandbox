<template>
    <div v-if="activeResource" class="custom-cursor" :style="cursorStyle" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface CursorRow {
    name: string;
    resource: string;
}

interface CursorConfigRow {
    width: number;
    height: number;
}

const DEFAULT_CURSOR = 'default';
const DEFAULT_WIDTH = 28;
const DEFAULT_HEIGHT = 28;
const SUPPORTED_CURSORS = new Set([
    'default',
    'pointer',
    'text',
    'crosshair',
    'move',
    'grab',
    'wait',
    'not-allowed',
]);

const pointerX = ref(0);
const pointerY = ref(0);
const pointerInside = ref(false);
const activeCursorName = ref(DEFAULT_CURSOR);
const cursorRows = ref<CursorRow[]>([]);
const cursorConfig = ref<CursorConfigRow>({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
const unsubscribeFns: Array<() => void> = [];
let hiddenCursorElement: Element | null = null;

const cursorMap = computed(() => {
    const entries = cursorRows.value
        .filter((row): row is CursorRow => typeof row?.name === 'string')
        .map((row) => [normalizeCursorName(row.name), row.resource] as const);

    return new Map(entries);
});

const activeResource = computed(() => {
    if (!pointerInside.value) {
        return '';
    }

    return cursorMap.value.get(activeCursorName.value) ?? '';
});

const cursorStyle = computed(() => ({
    left: `${pointerX.value}px`,
    top: `${pointerY.value}px`,
    width: `${cursorConfig.value.width}px`,
    height: `${cursorConfig.value.height}px`,
    '--cursor-resource': `url("${activeResource.value}")`,
}));

function normalizeCursorName(value: string) {
    const normalized = value.trim().toLowerCase();

    if (!normalized || normalized === 'auto' || normalized === 'none') {
        return DEFAULT_CURSOR;
    }

    if (normalized === 'all-scroll') {
        return 'move';
    }

    if (normalized === 'copy' || normalized === 'alias') {
        return 'pointer';
    }

    if (normalized === 'grabbing') {
        return 'grab';
    }

    if (
        normalized === 'progress' ||
        normalized === 'help' ||
        normalized === 'context-menu' ||
        normalized === 'cell'
    ) {
        return DEFAULT_CURSOR;
    }

    return SUPPORTED_CURSORS.has(normalized) ? normalized : DEFAULT_CURSOR;
}

function readCursorNameFromTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
        return DEFAULT_CURSOR;
    }

    const resolvedCursor = window.getComputedStyle(target).cursor;

    if (resolvedCursor.startsWith('url(')) {
        const fallbackCursor = resolvedCursor.split(',').at(-1)?.trim();
        return normalizeCursorName(fallbackCursor ?? DEFAULT_CURSOR);
    }

    return normalizeCursorName(resolvedCursor);
}

function clearHiddenCursorElement() {
    hiddenCursorElement?.classList.remove('custom-cursor-hidden-target');
    hiddenCursorElement = null;
}

function applyHiddenCursorElement(target: EventTarget | null) {
    if (!activeResource.value || !(target instanceof Element)) {
        return;
    }

    target.classList.add('custom-cursor-hidden-target');
    hiddenCursorElement = target;
}

function handlePointerMove(event: PointerEvent) {
    clearHiddenCursorElement();
    pointerX.value = event.clientX;
    pointerY.value = event.clientY;
    pointerInside.value = true;
    activeCursorName.value = readCursorNameFromTarget(event.target);
    applyHiddenCursorElement(event.target);
}

function handlePointerLeave() {
    clearHiddenCursorElement();
    pointerInside.value = false;
    activeCursorName.value = DEFAULT_CURSOR;
}

function syncCursorVariables() {
    const localVariables = window.EI?.localVariables as
        | {
              cursor?: unknown;
              config?: unknown;
          }
        | undefined;

    cursorRows.value = Array.isArray(localVariables?.cursor)
        ? (localVariables.cursor.filter(
              (row): row is CursorRow =>
                  typeof row === 'object' &&
                  row !== null &&
                  typeof (row as CursorRow).name === 'string' &&
                  typeof (row as CursorRow).resource === 'string',
          ) as CursorRow[])
        : [];

    const configRow = Array.isArray(localVariables?.config) ? localVariables.config[0] : undefined;
    cursorConfig.value = {
        width:
            typeof (configRow as CursorConfigRow | undefined)?.width === 'number'
                ? Math.max(1, (configRow as CursorConfigRow).width)
                : DEFAULT_WIDTH,
        height:
            typeof (configRow as CursorConfigRow | undefined)?.height === 'number'
                ? Math.max(1, (configRow as CursorConfigRow).height)
                : DEFAULT_HEIGHT,
    };
}

onMounted(async () => {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);

    const ei = window.EI;
    if (!ei) {
        return;
    }

    await ei.ready;
    syncCursorVariables();

    unsubscribeFns.push(
        ei.subscribe('cursor', () => {
            syncCursorVariables();
        }),
    );

    unsubscribeFns.push(
        ei.subscribe('config', () => {
            syncCursorVariables();
        }),
    );
});

onBeforeUnmount(() => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerleave', handlePointerLeave);
    window.removeEventListener('blur', handlePointerLeave);
    clearHiddenCursorElement();

    while (unsubscribeFns.length > 0) {
        unsubscribeFns.pop()?.();
    }
});
</script>

<style scoped>
.custom-cursor {
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    transform: translate(-4px, -4px);
    background: var(--ei-primary, #38bdf8);
    -webkit-mask-image: var(--cursor-resource);
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    -webkit-mask-size: contain;
    mask-image: var(--cursor-resource);
    mask-repeat: no-repeat;
    mask-position: center;
    mask-size: contain;
}

:global(.custom-cursor-hidden-target) {
    cursor: none !important;
}
</style>
