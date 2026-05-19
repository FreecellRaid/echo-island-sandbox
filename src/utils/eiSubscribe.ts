type Scope = 'scope' | 'db';

type DistinctCallback<TValue> = (value: TValue) => void;
type DistinctComparator = (nextValue: unknown, previousValue: unknown) => boolean;

interface SubscribeDistinctOptions<TValue> {
    equals?: DistinctComparator;
    emitInitial?: boolean;
    getEi?: () => Window['EI'];
    initialValue?: TValue;
}

// 这些命名空间不能从 local/globalVariables 同步快照里直接按路径还原，
// 只能等待 EI.subscribe 的首次广播来建立基线。
const RESERVED_NAMESPACES = new Set(['角色', '当前', '骰子', '计算', 'pl']);
const UNSET = Symbol('ei-subscribe-unset');

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function isEiValueEqual(nextValue: unknown, previousValue: unknown): boolean {
    if (Object.is(nextValue, previousValue)) {
        return true;
    }

    // 默认支持数组和普通对象的深比较，避免广播回调里重复收到“结构相同”的值。
    if (Array.isArray(nextValue) && Array.isArray(previousValue)) {
        if (nextValue.length !== previousValue.length) {
            return false;
        }

        return nextValue.every((item, index) => isEiValueEqual(item, previousValue[index]));
    }

    if (!isPlainObject(nextValue) || !isPlainObject(previousValue)) {
        return false;
    }

    const nextKeys = Object.keys(nextValue);
    const previousKeys = Object.keys(previousValue);

    if (nextKeys.length !== previousKeys.length) {
        return false;
    }

    return nextKeys.every(
        (key) =>
            Object.prototype.hasOwnProperty.call(previousValue, key) &&
            isEiValueEqual(nextValue[key], previousValue[key]),
    );
}

// 对普通变量路径优先从 EI 快照读一次，尽量在订阅建立时就拿到“上一个值”。
// 这里只处理 local/globalVariables 能直接映射的路径，不处理预设命名空间。
function readFromSnapshot(path: string, scope: Scope, ei: NonNullable<Window['EI']>): unknown {
    const [root, ...segments] = path.split('.');
    if (!root || RESERVED_NAMESPACES.has(root)) {
        return UNSET;
    }

    const source = scope === 'db' ? ei.globalVariables : ei.localVariables;
    let cursor: unknown = source[root];

    for (const segment of segments) {
        if (Array.isArray(cursor)) {
            const arrayIndex = Number(segment) - 1;
            if (!Number.isInteger(arrayIndex) || arrayIndex < 0) {
                return UNSET;
            }

            cursor = cursor[arrayIndex];
            continue;
        }

        if (!isPlainObject(cursor)) {
            return UNSET;
        }

        cursor = cursor[segment];
    }

    return cursor;
}

export function subscribeEiDistinct<TValue = unknown>(
    path: string,
    distinctCallback: DistinctCallback<TValue>,
    scope: Scope = 'scope',
    options: SubscribeDistinctOptions<TValue> = {},
) {
    const ei = options.getEi?.() ?? window.EI;
    if (!ei) {
        return () => undefined;
    }

    const equals = options.equals ?? isEiValueEqual;
    const hasExplicitInitialValue = Object.prototype.hasOwnProperty.call(options, 'initialValue');
    const snapshotValue = hasExplicitInitialValue ? UNSET : readFromSnapshot(path, scope, ei);
    let lastValue: unknown = hasExplicitInitialValue ? options.initialValue : snapshotValue;
    let hasValue = lastValue !== UNSET;

    // 已经有基线时，允许在订阅建立后立刻同步一次当前值。
    if (options.emitInitial && hasValue) {
        distinctCallback(lastValue as TValue);
    }

    return ei.subscribe(
        path,
        (nextValue) => {
            // 预设路径或缺失快照的情况，第一次广播只用于建立基线，不算“变化”。
            if (!hasValue) {
                lastValue = nextValue;
                hasValue = true;

                if (options.emitInitial) {
                    distinctCallback(nextValue as TValue);
                }
                return;
            }

            if (equals(nextValue, lastValue)) {
                return;
            }

            // 只有真实变化时才向业务层转发。
            lastValue = nextValue;
            distinctCallback(nextValue as TValue);
        },
        scope,
    );
}
