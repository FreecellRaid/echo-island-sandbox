import { echoIslandMockConfig } from './mockVariables';

type Scope = 'scope' | 'db';
type Subscriber = (value: unknown) => void;
type EchoIslandApi = NonNullable<Window['EI']>;

function deepClone<T>(value: T): T {
    if (value == null) {
        return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDeferred() {
    let resolveReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
    });

    return { ready, resolveReady };
}

function normalizeTemplatePath(path: string) {
    if (path.startsWith('变量.')) {
        return { scope: 'scope' as const, path: path.slice(3) };
    }

    if (path.startsWith('全局.')) {
        return { scope: 'db' as const, path: path.slice(3) };
    }

    return { scope: null, path };
}

function getRootState(scope: Scope, localVariables: Record<string, unknown>, globalVariables: Record<string, unknown>) {
    return scope === 'db' ? globalVariables : localVariables;
}

function findRowByKey(rows: unknown[], token: string) {
    return rows.find((row) => {
        if (!isObject(row)) {
            return false;
        }

        const [firstColumnKey] = Object.keys(row);
        if (!firstColumnKey) {
            return false;
        }

        return String(row[firstColumnKey]) === token;
    });
}

function getFromSegments(source: unknown, segments: string[]) {
    let current = source;

    for (const segment of segments) {
        if (Array.isArray(current)) {
            const index = Number(segment);
            if (Number.isInteger(index) && index >= 1) {
                current = current[index - 1];
                continue;
            }

            current = findRowByKey(current, segment);
            continue;
        }

        if (isObject(current)) {
            current = current[segment];
            continue;
        }

        return undefined;
    }

    return current;
}

function setFromSegments(source: Record<string, unknown>, segments: string[], value: unknown) {
    if (segments.length === 0) {
        return;
    }

    let current: unknown = source;

    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const nextSegment = segments[index + 1];
        if (!segment || !nextSegment) {
            return;
        }

        if (Array.isArray(current)) {
            const rowIndex = Number(segment);
            const row =
                Number.isInteger(rowIndex) && rowIndex >= 1
                    ? current[rowIndex - 1]
                    : findRowByKey(current, segment);

            if (!isObject(row)) {
                return;
            }

            current = row;
            continue;
        }

        if (!isObject(current)) {
            return;
        }

        if (!(segment in current) || current[segment] == null) {
            current[segment] = Number.isInteger(Number(nextSegment)) ? [] : {};
        }

        current = current[segment];
    }

    const finalSegment = segments.at(-1);
    if (!finalSegment) {
        return;
    }

    if (Array.isArray(current)) {
        const rowIndex = Number(finalSegment);
        if (Number.isInteger(rowIndex) && rowIndex >= 1) {
            current[rowIndex - 1] = value;
            return;
        }

        const row = findRowByKey(current, finalSegment);
        if (row && isObject(row)) {
            Object.assign(row, isObject(value) ? value : { value });
        }

        return;
    }

    if (isObject(current)) {
        current[finalSegment] = value;
    }
}

function parseDice(expression: string) {
    const match = expression.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) {
        return '??';
    }

    const count = Number(match[1]);
    const sides = Number(match[2]);
    const modifier = Number(match[3] ?? 0);

    let total = modifier;
    for (let index = 0; index < count; index += 1) {
        total += Math.floor(Math.random() * sides) + 1;
    }

    return total;
}

function parseMath(expression: string) {
    const normalized = expression.replace(/\^/g, '**');

    try {
        return Function(`"use strict"; return (${normalized});`)() as number;
    } catch {
        return '??';
    }
}

export function installEchoIslandMock() {
    if (window.EI) {
        return window.EI;
    }

    const localVariables = deepClone(echoIslandMockConfig.localVariables);
    const globalVariables = deepClone(echoIslandMockConfig.globalVariables);
    const roleVariables = deepClone(echoIslandMockConfig.roles);
    const currentVariables = deepClone(echoIslandMockConfig.current);
    const subscribers = new Map<string, Set<Subscriber>>();
    const { ready, resolveReady } = createDeferred();

    function notify(path: string, scope: Scope) {
        const value = readPath(path, scope);
        const key = `${scope}:${path}`;
        subscribers.get(key)?.forEach((subscriber) => {
            subscriber(value);
        });
    }

    function readPreset(path: string) {
        if (path.startsWith('角色.')) {
            return getFromSegments(roleVariables, path.split('.'));
        }

        if (path.startsWith('当前.')) {
            return getFromSegments(currentVariables, path.split('.').slice(1));
        }

        if (path.startsWith('骰子.')) {
            return parseDice(path.slice(3));
        }

        if (path.startsWith('计算.')) {
            return parseMath(path.slice(3));
        }

        return undefined;
    }

    function readPath(path: string, scope: Scope = 'scope') {
        const presetValue = readPreset(path);
        if (presetValue !== undefined) {
            return presetValue;
        }

        const rootState = getRootState(scope, localVariables, globalVariables);
        return getFromSegments(rootState, path.split('.'));
    }

    const echoIslandApi: EchoIslandApi = {
        ready,
        localVariables,
        globalVariables,
        now: deepClone(echoIslandMockConfig.now),
        onReady(fn: () => void) {
            ready.then(fn);
        },
        async assign(path: string, value: unknown, scope: Scope = 'scope') {
            const rootState = getRootState(scope, localVariables, globalVariables);
            setFromSegments(rootState, path.split('.'), value);
            notify(path, scope);
        },
        async read(path: string, scope: Scope = 'scope') {
            return deepClone(readPath(path, scope));
        },
        subscribe(path: string, cb: Subscriber, scope: Scope = 'scope') {
            const key = `${scope}:${path}`;
            const scopedSubscribers = subscribers.get(key) ?? new Set<Subscriber>();
            scopedSubscribers.add(cb);
            subscribers.set(key, scopedSubscribers);

            cb(readPath(path, scope));

            return () => {
                scopedSubscribers.delete(cb);
                if (scopedSubscribers.size === 0) {
                    subscribers.delete(key);
                }
            };
        },
        async parse(template: string) {
            const exactMatch = template.match(/^\$\{(.+)\}$/);
            if (exactMatch?.[1]) {
                const normalized = normalizeTemplatePath(exactMatch[1]);
                return normalized.scope
                    ? readPath(normalized.path, normalized.scope)
                    : readPath(normalized.path);
            }

            return template.replace(/\$\{([^}]+)\}/g, (_full: string, token: string) => {
                const normalized = normalizeTemplatePath(token);
                const value = normalized.scope
                    ? readPath(normalized.path, normalized.scope)
                    : readPath(normalized.path);
                return value == null ? '??' : String(value);
            });
        },
        msg(text: string) {
            console.info('[EI mock] msg:', text);
        },
        toast(text: string) {
            console.info('[EI mock] toast:', text);
        },
        setDesignSize(width: number, height: number) {
            document.documentElement.style.setProperty('--ei-mock-design-width', `${width}`);
            document.documentElement.style.setProperty('--ei-mock-design-height', `${height}`);
            console.info('[EI mock] setDesignSize:', width, height);
        },
    };

    window.EI = echoIslandApi;

    queueMicrotask(() => {
        resolveReady();
    });

    return echoIslandApi;
}
