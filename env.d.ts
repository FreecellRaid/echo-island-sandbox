/// <reference types="vite/client" />

interface EchoIslandApi {
    ready: Promise<void>;
    localVariables: Record<string, unknown>;
    globalVariables: Record<string, unknown>;
    now: {
        all: string[];
        players: string[];
        npcs: string[];
    };
    onReady(fn: () => void): void;
    assign(path: string, value: unknown, scope?: 'scope' | 'db'): Promise<void>;
    read(path: string, scope?: 'scope' | 'db'): Promise<unknown>;
    subscribe(path: string, cb: (value: unknown) => void, scope?: 'scope' | 'db'): () => void;
    parse(str: string): Promise<unknown>;
    msg(text: string): void;
    toast(text: string): void;
    setDesignSize(width: number, height: number): void;
}

interface EchoIslandMockController {
    setCurrentSpeaker(speaker: string): void;
}

declare global {
    interface Window {
        EI?: EchoIslandApi;
        __EI_MOCK__?: EchoIslandMockController;
    }
}

export {};
