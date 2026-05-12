type Scope = 'scope' | 'db';
type ToastableEi = Pick<NonNullable<Window['EI']>, 'assign' | 'msg' | 'toast'>;
type EiGetter = () => ToastableEi | undefined;
type AsyncVoid = Promise<void>;

interface RateLimitMessages {
    missingEi?: string;
    scheduled?: string;
    replaced?: string;
}

interface RateLimitOptions {
    getEi?: EiGetter;
    messages?: RateLimitMessages;
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
    task: (ei: ToastableEi, args: TArgs) => AsyncVoid,
    args: TArgs,
) {
    const ei = getEi();
    if (!ei) {
        const error = new Error(messages?.missingEi ?? 'window.EI is unavailable.');
        return Promise.reject(error);
    }

    return task(ei, args);
}

export function createEiDebounce<TArgs extends unknown[]>(
    task: (ei: ToastableEi, args: TArgs) => AsyncVoid,
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
            window.clearTimeout(timerId);
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
        }, waitMs);

        if (deferredQueue.length === 1) {
            toast('scheduled');
        }

        return deferred.promise;
    };

    return run;
}

export function createEiThrottle<TArgs extends unknown[]>(
    task: (ei: ToastableEi, args: TArgs) => AsyncVoid,
    waitMs = 1000,
    options: RateLimitOptions = {},
) {
    const getEi = options.getEi ?? (() => window.EI);
    const toast = createToast(getEi, options.messages);
    let timerId: ReturnType<typeof window.setTimeout> | null = null;
    let lastExecutedAt = 0;
    let trailingArgs: TArgs | null = null;
    const deferredQueue: Deferred[] = [];

    const flushTrailing = async () => {
        timerId = null;
        const queuedArgs = trailingArgs;
        trailingArgs = null;

        if (!queuedArgs) {
            flushDeferredQueue(deferredQueue);
            return;
        }

        lastExecutedAt = Date.now();

        try {
            await runEiTask(getEi, options.messages, task, queuedArgs);
            flushDeferredQueue(deferredQueue);
        } catch (error) {
            flushDeferredQueue(deferredQueue, error);
        }
    };

    const run: Runner<TArgs> = async (...args) => {
        const now = Date.now();
        const elapsed = now - lastExecutedAt;

        if (lastExecutedAt === 0 || elapsed >= waitMs) {
            lastExecutedAt = now;
            return runEiTask(getEi, options.messages, task, args);
        }

        trailingArgs = args;
        const deferred = createDeferred();
        deferredQueue.push(deferred);

        if (timerId !== null) {
            toast('replaced');
            return deferred.promise;
        }

        toast('scheduled');
        timerId = window.setTimeout(() => {
            void flushTrailing();
        }, waitMs - elapsed);

        return deferred.promise;
    };

    return run;
}

export function createEiAssignDebounce(waitMs = 1000, options: RateLimitOptions = {}) {
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

export function createEiAssignThrottle(waitMs = 1000, options: RateLimitOptions = {}) {
    return createEiThrottle<[path: string, value: unknown, scope?: Scope]>(
        (ei, [path, value, scope]) => ei.assign(path, value, scope),
        waitMs,
        {
            ...options,
            messages: {
                scheduled: '写入过快，已排队等待下一次写入。',
                replaced: '排队中的写入已更新为最新值。',
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
            ...options,
            messages: {
                scheduled: '消息发送过快，已排队等待发送。',
                replaced: '排队中的消息已更新为最新内容。',
                ...options.messages,
            },
        },
    );
}
