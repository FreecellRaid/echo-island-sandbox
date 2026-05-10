export interface EchoIslandMockConfig {
    localVariables: Record<string, unknown>;
    globalVariables: Record<string, unknown>;
    roles: Record<string, Record<string, unknown>>;
    current: Record<string, unknown>;
    now: {
        all: string[];
        players: string[];
        npcs: string[];
    };
}

export const echoIslandMockConfig: EchoIslandMockConfig = {
    localVariables: {
        计数器: 3,
        商店数据: [
            { 名称: '生命药水', 价格: 50 },
            { 名称: '法力药水', 价格: 60 },
        ],
        cursor: [
            {
                name: 'default',
                resource: 'https://api.iconify.design/lucide/mouse-pointer-2.svg?color=%23fff',
            },
            {
                name: 'pointer',
                resource: 'https://api.iconify.design/lucide/hand.svg?color=%23fff',
            },
            {
                name: 'text',
                resource: 'https://api.iconify.design/lucide/text-cursor.svg?color=%23fff',
            },
            {
                name: 'crosshair',
                resource: 'https://api.iconify.design/lucide/crosshair.svg?color=%23fff',
            },
            {
                name: 'move',
                resource: 'https://api.iconify.design/lucide/move.svg?color=%23fff',
            },
            {
                name: 'grab',
                resource: 'https://api.iconify.design/lucide/hand-metal.svg?color=%23fff',
            },
            {
                name: 'wait',
                resource: 'https://api.iconify.design/lucide/loader-circle.svg?color=%23fff',
            },
            {
                name: 'not-allowed',
                resource: 'https://api.iconify.design/lucide/ban.svg?color=%23fff',
            },
        ],
        config: [
            {
                width: 28,
                height: 28,
            },
        ],
    },
    globalVariables: {
        今日任务: ['收集药草', '巡逻港口'],
    },
    roles: {
        张三: {
            hp: 13,
            san: 8,
            力量: 11,
            副标题: '调查员',
            显示名称: '阿三',
        },
        李四: {
            hp: 9,
            san: 10,
            力量: 7,
            副标题: '见习水手',
            显示名称: '李四',
        },
    },
    current: {
        频道: '薄雾码头',
        场景名: '旧港补给站',
        场景图: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=1200&q=80',
        发言者: '张三',
        观看者: '李四',
        角色: ['张三', '李四'],
    },
    now: {
        all: ['张三', '李四', '老船长'],
        players: ['张三', '李四'],
        npcs: ['老船长'],
    },
};
