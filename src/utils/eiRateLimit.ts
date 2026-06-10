import type { Scope } from '../types/eiTypes';

type GuardableEi = Pick<NonNullable<Window['EI']>, 'assign' | 'msg' | 'toast' | 'parse' | 'me'>;
type EiGetter = () => GuardableEi | undefined;
type AsyncVoid = Promise<void>;

interface RateLimitMessages {
    missingEi?: string;
    scheduled?: string;
    replaced?: string;
    gmOnly?: string;
}

interface RateLimitOptions {
    getEi?: EiGetter;
    messages?: RateLimitMessages;
}

interface ThrottleOptions extends RateLimitOptions {
    burstLimit?: number;
}

interface GmLockOptions extends RateLimitOptions {
    gmName?: string;
}

interface Deferred {
    resolve: () => void;
    reject: (reason?: unknown) => void;
}

type Runner<TArgs extends unknown[]> = (...args: TArgs) => AsyncVoid;

function createDeferred() {
    let resolve: Deferred['resolve'] = () => undefined;
    let reject: Deferred['reject'] = () => undefined;

    const promise = new Promise<void>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });

    return { promise, resolve, reject };
}

function createToast(getEi: EiGetter, messages?: RateLimitMessages) {
    return (key: keyof RateLimitMessages) => {
        const message = messages?.[key];
        if (!message) {
            return;
        }

        getEi()?.toast(message);
    };
}

function flushDeferredQueue(queue: Deferred[], error?: unknown) {
    const pending = queue.splice(0, queue.length);
    pending.forEach(({ resolve, reject }) => {
        if (error === undefined) {
            resolve();
            return;
        }

        reject(error);
    });
}

function runEiTask<TArgs extends unknown[]>(
    getEi: EiGetter,
    messages: RateLimitMessages | undefined,
    task: (ei: GuardableEi, args: TArgs) => AsyncVoid,
    args: TArgs,
) {
    const ei = getEi();
    if (!ei) {
        const error = new Error(messages?.missingEi ?? 'window.EI is unavailable.');
        return Promise.reject(error);
    }

    return task(ei, args);
}

// 优先读同步可用的 EI.me，只有旧环境缺失时才退回 parse。
async function readEiViewer(ei: GuardableEi) {
    if (typeof ei.me === 'string' && ei.me.trim().length > 0) {
        return ei.me;
    }

    return ei.parse('${当前.观看者}');
}

export function withEiGmLock<TArgs extends unknown[]>(
    task: (ei: GuardableEi, args: TArgs) => AsyncVoid,
    options: GmLockOptions = {},
) {
    return async (ei: GuardableEi, args: TArgs) => {
        const viewer = await readEiViewer(ei);
        const gmName = options.gmName ?? 'GM';
        const isGmViewer = typeof viewer === 'string' && viewer.trim() === gmName;

        if (!isGmViewer) {
            const message = options.messages?.gmOnly;
            if (message) {
                ei.toast(message);
            }
            return;
        }

        await task(ei, args);
    };
}

export function createEiGmGuard<TArgs extends unknown[]>(
    task: (ei: GuardableEi, args: TArgs) => AsyncVoid,
    options: GmLockOptions = {},
) {
    const getEi = options.getEi ?? (() => window.EI);
    const guardedTask = withEiGmLock(task, options);

    const run: Runner<TArgs> = (...args) => runEiTask(getEi, options.messages, guardedTask, args);

    return run;
}

export function createEiDebounce<TArgs extends unknown[]>(
    task: (ei: GuardableEi, args: TArgs) => AsyncVoid,
    waitMs = 1000,
    options: RateLimitOptions = {},
) {
    const getEi = options.getEi ?? (() => window.EI);
    const toast = createToast(getEi, options.messages);
    let timerId: ReturnType<typeof window.setTimeout> | null = null;
    let latestArgs: TArgs | null = null;
    const deferredQueue: Deferred[] = [];

    const run: Runner<TArgs> = (...args) => {
        latestArgs = args;
        const deferred = createDeferred();
        deferredQueue.push(deferred);

        if (timerId !== null) {
            window.clearTimeout(timerId as unknown as number);
            toast('replaced');
        }

        timerId = window.setTimeout(async () => {
            timerId = null;
            const queuedArgs = latestArgs;
            latestArgs = null;

            if (!queuedArgs) {
                flushDeferredQueue(deferredQueue);
                return;
            }

            try {
                await runEiTask(getEi, options.messages, task, queuedArgs);
                flushDeferredQueue(deferredQueue);
            } catch (error) {
                flushDeferredQueue(deferredQueue, error);
            }
        }, waitMs) as unknown as ReturnType<typeof window.setTimeout>;

        if (deferredQueue.length === 1) {
            toast('scheduled');
        }

        return deferred.promise;
    };

    return run;
}

// 固定窗口节流：窗口内允许 burstLimit 次立即执行；超出的调用只保留最后一次，
// 并在窗口结束时补一次 trailing 执行，尽量贴近 EI “可短时连发”的限制。
export function createEiThrottle<TArgs extends unknown[]>(
    task: (ei: GuardableEi, args: TArgs) => AsyncVoid,
    waitMs = 1000,
    options: ThrottleOptions = {},
) {
    const getEi = options.getEi ?? (() => window.EI);
    const toast = createToast(getEi, options.messages);
    const burstLimit = Math.max(1, Math.floor(options.burstLimit ?? 1));
    let timerId: ReturnType<typeof window.setTimeout> | null = null;
    let windowStartedAt = 0;
    let executionCount = 0;
    let trailingArgs: TArgs | null = null;
    const deferredQueue: Deferred[] = [];

    function resetWindow(now: number) {
        if (windowStartedAt === 0 || now - windowStartedAt >= waitMs) {
            windowStartedAt = now;
            executionCount = 0;
        }
    }

    async function execute(args: TArgs, flushQueued = false) {
        const now = Date.now();
        resetWindow(now);
        executionCount += 1;

        try {
            await runEiTask(getEi, options.messages, task, args);
            if (flushQueued) {
                flushDeferredQueue(deferredQueue);
            }
        } catch (error) {
            if (flushQueued) {
                flushDeferredQueue(deferredQueue, error);
            }
            throw error;
        }
    }

    const flushTrailing = async () => {
        timerId = null;
        const queuedArgs = trailingArgs;
        trailingArgs = null;

        if (!queuedArgs) {
            flushDeferredQueue(deferredQueue);
            return;
        }

        await execute(queuedArgs, true);
    };

    const run: Runner<TArgs> = async (...args) => {
        const now = Date.now();
        resetWindow(now);

        if (executionCount < burstLimit) {
            if (timerId !== null) {
                window.clearTimeout(timerId as unknown as number);
                timerId = null;
                trailingArgs = null;
            }

            return execute(args, deferredQueue.length > 0);
        }

        trailingArgs = args;
        const deferred = createDeferred();
        deferredQueue.push(deferred);

        if (timerId !== null) {
            toast('replaced');
            return deferred.promise;
        }

        toast('scheduled');
        timerId = window.setTimeout(
            () => {
                void flushTrailing();
            },
            Math.max(waitMs - (now - windowStartedAt), 0),
        ) as unknown as ReturnType<typeof window.setTimeout>;

        return deferred.promise;
    };

    return run;
}

export function createEiAssignDebounce(waitMs = 2000, options: RateLimitOptions = {}) {
    return createEiDebounce<[path: string, value: unknown, scope?: Scope]>(
        (ei, [path, value, scope]) => ei.assign(path, value, scope),
        waitMs,
        {
            ...options,
            messages: {
                scheduled: '写入已进入防抖队列。',
                replaced: '连续写入已合并为最后一次结果。',
                ...options.messages,
            },
        },
    );
}

export function createEiAssignThrottle(waitMs = 2000, options: RateLimitOptions = {}) {
    return createEiThrottle<[path: string, value: unknown, scope?: Scope]>(
        (ei, [path, value, scope]) => ei.assign(path, value, scope),
        waitMs,
        {
            burstLimit: 2,
            ...options,
            messages: {
                scheduled: '写入过快，已排队等待下一次写入。',
                replaced: '排队中的写入已更新为最新值。',
                ...options.messages,
            },
        },
    );
}

export function createEiAssignDebounceByGm(waitMs = 2000, options: GmLockOptions = {}) {
    return createEiDebounce<[path: string, value: unknown, scope?: Scope]>(
        withEiGmLock((ei, [path, value, scope]) => ei.assign(path, value, scope), options),
        waitMs,
        {
            ...options,
            messages: {
                scheduled: '写入已进入防抖队列。',
                replaced: '连续写入已合并为最后一次结果。',
                gmOnly: '仅 GM 可写入该变量。',
                ...options.messages,
            },
        },
    );
}

export function createEiAssignThrottleByGm(waitMs = 2000, options: GmLockOptions = {}) {
    return createEiThrottle<[path: string, value: unknown, scope?: Scope]>(
        withEiGmLock((ei, [path, value, scope]) => ei.assign(path, value, scope), options),
        waitMs,
        {
            burstLimit: 2,
            ...options,
            messages: {
                scheduled: '写入过快，已排队等待下一次写入。',
                replaced: '排队中的写入已更新为最新值。',
                gmOnly: '仅 GM 可写入该变量。',
                ...options.messages,
            },
        },
    );
}

export function createEiMsgDebounce(waitMs = 1000, options: RateLimitOptions = {}) {
    return createEiDebounce<[text: string]>(
        async (ei, [text]) => {
            ei.msg(text);
        },
        waitMs,
        {
            ...options,
            messages: {
                scheduled: '消息已进入防抖队列。',
                replaced: '连续消息已合并为最后一条。',
                ...options.messages,
            },
        },
    );
}

export function createEiMsgThrottle(waitMs = 1000, options: RateLimitOptions = {}) {
    return createEiThrottle<[text: string]>(
        async (ei, [text]) => {
            ei.msg(text);
        },
        waitMs,
        {
            burstLimit: 2,
            ...options,
            messages: {
                scheduled: '消息发送过快，已排队等待发送。',
                replaced: '排队中的消息已更新为最新内容。',
                ...options.messages,
            },
        },
    );
}

export function createEiMsgDebounceByGm(waitMs = 1000, options: GmLockOptions = {}) {
    return createEiDebounce<[text: string]>(
        withEiGmLock(async (ei, [text]) => {
            ei.msg(text);
        }, options),
        waitMs,
        {
            ...options,
            messages: {
                scheduled: '消息已进入防抖队列。',
                replaced: '连续消息已合并为最后一条。',
                gmOnly: '仅 GM 可发送该消息。',
                ...options.messages,
            },
        },
    );
}

export function createEiMsgThrottleByGm(waitMs = 1000, options: GmLockOptions = {}) {
    return createEiThrottle<[text: string]>(
        withEiGmLock(async (ei, [text]) => {
            ei.msg(text);
        }, options),
        waitMs,
        {
            burstLimit: 2,
            ...options,
            messages: {
                scheduled: '消息发送过快，已排队等待发送。',
                replaced: '排队中的消息已更新为最新内容。',
                gmOnly: '仅 GM 可发送该消息。',
                ...options.messages,
            },
        },
    );
}
