# 回声岛代码节点开发

代码节点是回声岛沙盒系统中的一种节点类型，允许在独立、隔离的环境中运行HTML代码，以实现完全自定义的UI外观和代码逻辑。

## 运行环境

- 代码跑在一个隔离的 iframe 沙箱里：**无法发送任何网络请求**（fetch / XHR / WebSocket 均禁用），也无法访问父页面、cookie、localStorage、跨域资源、表单提交等
- 可以正常使用：内联 `<script>`、动态代码生成（Vue template 编译）、外链 `<img>` / `<video>` / 字体
- 已自动为你注入：
    - Vue 3 全局运行时：可直接 `Vue.createApp(...).mount('#app')`
    - Tailwind 兼容语法：直接写 class 即可生效，无需任何 `<script>` / `<link>`。支持**所有常规原子类**（`bg-red-500` / `text-xl` / `grid-cols-3` / `hover:*` / `md:*` / `dark:*` 等）和**任意值**（`pt-[5px]` / `bg-[#abcdef]` / `grid-cols-[1fr_2fr]` / `[mask:linear-gradient(...)]`）
    - 主题 CSS 变量：`--ei-bg` / `--ei-fg` / `--ei-primary` / `--ei-primary-fg` / `--ei-muted` / `--ei-muted-fg` / `--ei-border`
    - 主题色已映射为 Tailwind 颜色，优先使用语义类来联动日夜模式：`bg-background` / `text-foreground` / `bg-primary` / `text-primary-foreground` / `bg-muted` / `text-muted-foreground` / `border-border`
    - `<html>` 自动切换 `dark` 类，`dark:*` 变体工作正常

## 尺寸适配

两种模式，必须主动选择：

**模式 A：设计尺寸 + 等比缩放（推荐）**

```html
<meta name="ei-design-size" content="400x300" />
```

iframe 锁定在 400×300，节点拖拽时整体等比缩放 —— 所有 px、border、图片视觉上一起伸缩。`window.innerWidth/innerHeight` 恒等于设计尺寸。适合状态面板、角色卡、小游戏等**强视觉 UI**。运行时可用 `EI.setDesignSize(w, h)` 调整。请根据实际的组件功能来决定设计尺寸。

**模式 B：无设计尺寸 + 1:1 响应式**

不声明 meta，iframe viewport = 节点尺寸，px 就是真实的 px，`font-size: 16px` 永远 16px；自适应靠 `vw / vh / % / clamp()`。适合**文本/列表主导**的界面（日志、文档、长表格），节点放大只是容纳更多内容而非放大字号。

两种模式下 flex / grid / `vw` / `%` 做内部布局都照常工作。

## 沙盒变量系统：核心概念

在和沙盒交互前必须理解"变量"的含义。沙盒的数据分为几类：

### 1. 自定义变量

创作者在沙盒里预先定义的**数据存储**，供 UI 节点读写。两种存储域：

- **局部变量 / 当前沙盒变量**：仅当前沙盒可见，引用时加 `变量.` 前缀（例如 `变量.计数器`、`变量.商店数据`）
- **全局变量**：跨沙盒共享，引用时加 `全局.` 前缀（例如 `全局.今日任务`）

### 2. 变量类型

- **简单类型**：数字或文本（例如 `变量.计数器 = 3`、`变量.主题色 = "#ff0000"`）
- **表格 / 列表**：二维数据或一维数据。表格每行是一个对象，每列是一个键。示例：
    ```
    变量.商店数据 = [
      { 名称: "生命药水", 价格: 50 },
      { 名称: "法力药水", 价格: 60 },
    ]
    ```

### 3. 取出变量里的元素

> ⚠️ **仅适用于"路径字符串"**：下面的 1-based 索引和"首列行键"只在路径语法中生效，也就是 `EI.subscribe` / `EI.read` / `EI.assign` 的 `path` 参数、`EI.parse` 的模板字符串、以及沙盒内的 `${...}` 模板引用。
> 通过 `EI.localVariables` / `EI.globalVariables` 直接拿到的是**原生 JS 对象/数组**，索引仍是标准 **0-based**，请注意区分。

- **列表/表格索引从 1 开始**（路径语法下），不是 0：
    - 路径：`变量.商店数据.1.名称` 表示**第一行**的"名称"列 → `"生命药水"`
    - 对应的 JS 访问：`EI.localVariables.商店数据[0].名称`（数组下标从 0 开始）
- **表格首列值可以代替序号作为"行键"**（仅路径语法）：如果首列是"名称"、值是 `"生命药水"`，那么：
    - `变量.商店数据.生命药水.价格` 等同于 `变量.商店数据.1.价格` → `50`
    - （当首列值是纯数字时仍按序号处理）
    - JS 里没有行键快捷方式，需要自己写 `EI.localVariables.商店数据.find(r => r.名称 === '生命药水')?.价格`

### 4. 预设变量

回声岛已经为你准备好的一些变量（不需要创建，直接引用即可）：

| 引用语句                         | 说明                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| `${角色.<角色名>.<属性名>}`      | 角色的某个属性或角色变量，如 `${角色.张三.hp}` / `${角色.张三.心情}` |
| `${角色.<角色名>.<属性名>.上限}` | 某个属性的最大值，如 `${角色.张三.san.上限}`                         |
| `${角色.<角色名>.副标题}`        | 角色的副标题                                                         |
| `${角色.<角色名>.显示名称}`      | 角色显示在外的名字（存在假名时返回假名）                             |
| `${当前.频道}`                   | 当前频道名                                                           |
| `${当前.场景图}`                 | 当前场景的图片链接                                                   |
| `${当前.场景名}`                 | 当前场景名                                                           |
| `${当前.发言者}`                 | 当前发言的角色真名                                                   |
| `${当前.观看者}`                 | 当前打开回声岛的角色（同一 UI 不同玩家看到不同内容时用）             |
| `${当前.角色.1}`                 | 当前频道展示的第一个立绘角色（可替换为 `2` / `3`）                   |
| `${骰子.1d4+2}`                  | 使用骰子引擎计算，返回骰子结果                                       |
| `${计算.2^3+abs-4}`              | 执行数学计算（唯一允许在引用语句中含空格的类型）                     |

注意：  
在跑团过程中，GM 端`${当前.观看者} == "GM"` ，PL端`${当前.观看者} == "<角色名>"`，OB端`${当前.观看者} == "<账号名>(观众)"`  
在replay中：`${当前.观看者} == "GM"`

### 5. 角色属性 vs 角色变量

每个角色身上有两层数据，必须区分：

- **角色属性**：GM 在角色卡里声明的基础数据（hp / san / mp / 力量 / 自定义技能等）。**只读**，沙盒不能写入。
- **角色变量**：每个角色身上挂的独立动态数据层，专门给沙盒用。**可读可写**，写入新名字会自动创建。

两条语义规则：

1. **读取时同名优先角色变量**：`${角色.X.hp}` / `EI.read('角色.X.hp')` / `EI.subscribe('角色.X.hp', ...)` 都遵循同一套——该角色若存在叫 `hp` 的角色变量则返回它，否则才返回角色属性 hp。
2. **写入时不能与角色属性同名**：`EI.assign('角色.X.<某属性名>', ...)` 会被沙盒拒绝（返回错误：只读属性）。原因：写入只能落到"角色变量"层，写入和角色属性同名的字段会让该角色属性从此被"角色变量"屏蔽——通常不是作者的本意。如果想建立独立的角色状态量，请避免和角色属性同名（如 `临时HP` / `额外HP` 等）。

## 通信 API：`window.EI`

所有 `path` 参数（`EI.subscribe` / `EI.read` / `EI.assign` 和 `EI.parse` 里的模板字符串）**都沿用上面的沙盒变量约定**（包括 1-based 索引、表格首列行键、预设变量命名空间）。

```ts
// === 就绪等待（重要！）===
// iframe 刚加载完时，沙盒数据还没传过来。body 里的顶层 <script> 执行时，
// EI.localVariables 可能还是空对象。任何依赖沙盒数据的代码必须包在 onReady 里：
EI.onReady(fn: () => void): void          // 回调形式
EI.ready: Promise<void>                    // Promise 形式，await EI.ready 也可以

// === 只读快照（onReady 后可用；数据变化时会自动更新）===
EI.localVariables: Record<string, any>    // 当前沙盒变量（对应"变量.xxx"命名空间）
EI.globalVariables: Record<string, any>   // 全局变量（对应"全局.xxx"命名空间）

// === 角色名单预设（onReady 后可用）===
EI.now: {
  all: string[]        // 当前房间所有角色名（玩家 + NPC）
  players: string[]    // 仅玩家角色名
  npcs: string[]       // 仅 NPC 名
}

// === 本机身份（onReady 后可用，同步读取，无需 await）===
// 同一个 iframe 在房间内每个客户端都会独立运行，EI.me 是"本机观看者"的标识，
// 用于避免多客户端竞争写入数据（详见下一节"多客户端并发"）
EI.me: string         // 本机观看者真名；实际上等价于 await EI.parse('${当前.观看者}')

// === 写入（异步，有限速：约每 2 秒 1 次，可短时连发 2 次；会话累计上限 500 次。中间计算请在代码里做完，只写最终结果）===
// 第一个参数 path 是"变量名或路径"（不含"变量."/"全局."前缀）
// 第二个参数 scope 选择写入的命名空间：'scope'（默认，对应"变量"）或 'db'（对应"全局"）
EI.assign(path: string, value: any, scope?: 'scope' | 'db'): Promise<void>
// 例：await EI.assign('计数器', 5)                          // 写"变量.计数器"
// 例：await EI.assign('商店数据.1.价格', 80)                // 写表格第 1 行"价格"列
// 例：await EI.assign('今日任务', [...], 'db')              // 写"全局.今日任务"
// 例：await EI.assign('角色.张三.心情', '疲惫')             // 写角色变量"心情"（注意：与角色属性同名会被拒）
// 例：await EI.assign('pl.张三.临时HP', 5)                  // 等同写法；pl === 角色

// === 主动读最新值（异步）===
EI.read(path: string, scope?: 'scope' | 'db'): Promise<any>
// 例：await EI.read('计数器')                               // 读"变量.计数器"
// 例：await EI.read('商店数据.生命药水.价格')               // 读表格行键为"生命药水"的"价格"列

// === 订阅变化 ===
// 任意沙盒数据变化都会自动推送。路径可以是：
//   - 自定义变量路径（默认读"变量."；scope='db' 时读"全局."）
//   - 预设变量路径：角色.X.hp / 当前.ch / 骰子.xxx / 计算.xxx
// 返回 unsubscribe 函数
// 注意：EI.subscribe 本质上是"全局广播 + 按 path 重新取值"，
// 所以只要任意非 ${当前} 的变量发生改变，所有 EI.subscribe 都可能触发回调；
// 如果订阅的 path 实际没变，回调里拿到的会是旧值。业务侧请自行做去重。
EI.subscribe(path: string, cb: (value) => void, scope?: 'scope' | 'db'): () => void
// 例 1：订阅自定义变量
EI.subscribe('计数器', v => console.log('new:', v))
// 例 2：订阅角色属性（GM 改 HP 时会自动推送）
EI.subscribe('角色.张三.hp', v => console.log('hp changed:', v))
// 例 3：订阅当前频道
EI.subscribe('当前.频道', v => console.log('channel:', v))
// 例 4：订阅表格某一行某一列
EI.subscribe('商店数据.1.价格', v => console.log('price:', v))

// === 模板解析 ===
// 传入一个含 ${...} 的模板字符串，返回解析后的值。
// 支持所有预设变量和自定义变量的语法。
EI.parse(str: string): Promise<any>
// 例：await EI.parse('${角色.张三.hp}')                     // 返回数字
// 例：await EI.parse('${骰子.2d6+3}')                       // 返回掷骰结果
// 例：await EI.parse('HP = ${角色.张三.hp}')                // 返回字符串 "HP = 13"

// === 辅助（均有独立限流，超限会被静默丢弃；请勿用于帧级别调用）===
EI.msg(text: string): void        // 发送聊天消息到当前频道（约每秒 1 次，可短时连发 2 次；会话累计上限 500 次）
EI.toast(text: string): void      // Toast 提示（约每秒 1 次，可短时连发 3 次）
```

## 多客户端并发（重要）

**同一个代码节点在房间里每个客户端都会独立运行一个 iframe 实例**——例如 10 个玩家，意味着10 个 iframe 同时跑同一段代码。这在自动化写入数据时会导致竞争写入的问题。例如：

```js
// ❌ 反例：10 人房间里每秒会触发 10 次 EI.assign
setInterval(() => {
    EI.assign('剩余时间', --t);
}, 1000);
```

每次写入都会广播给全员、并且不同客户端的本地 `t` 也没有同步，会互相覆盖出现竞态。

**判定原则**：

- ✅ **由本机用户操作触发**的写入（按钮 onclick、表单提交、订阅回调里立即响应用户输入）→ 天然单写入，**不需要守卫**
- ✅ 写入"只属于本机角色自己"的数据（如 `pl.<我的角色>.xxx`）→ 单写入，不需要守卫
- ❌ **由 `setInterval` / `setTimeout` / `requestAnimationFrame` / 自发轮询等"自动触发器"产生**的对共享状态的写入 → N 倍放大，**必须用 `EI.me === 'GM'` 的方式守卫**

**正确写法**：让 GM 作为唯一写入者，其他客户端通过 subscribe 被动接收：

```js
let t = 30;
EI.onReady(() => {
    EI.subscribe('剩余时间', renderTimer); // 所有客户端都订阅展示
    if (EI.me === 'GM') {
        // ← 只有 GM 跑写入循环
        setInterval(() => EI.assign('剩余时间', --t), 1000);
    }
});
```

## 硬约束

- ❌ 无法发送 `fetch` / `XMLHttpRequest` / `WebSocket` 等网络请求
- ❌ 无法访问 `localStorage` / `cookie` / `document.domain` / 父页面
- ❌ `window.print()` / `navigator.vibrate()` / `speechSynthesis` 调用无效
- ✅ 可引用外链图片 / 视频 / 字体
- ⚠️ 单次 `EI.assign` 的 value **≤ 2KB**、嵌套深度 ≤ 5；超限会返回 error。代码节点定位是功能和 UI，不要用来存储/搬运大块数据，较大的数据请放在外部，并按需只读取片段
- ⚠️ `EI.assign` 限频约每 2 秒 1 次（可短时连发 2 次），**单次会话累计 500 次**；达到累计上限后本 iframe 生命周期内写入将被拒绝。应在代码内部聚合计算，只在最终态写入一次
- ⚠️ 写入 `角色.X.<字段名>` 时，**字段名不能与该角色的"角色属性"同名**（如 hp / san / mp / 力量 / 任意自定义技能），否则会被拒绝。详见"角色属性 vs 角色变量"小节
- ⚠️ 内部 JS 变量**不持久化**（页面刷新 / 重开沙盒即丢失）。要持久化必须调用 `EI.assign()` 写入沙盒变量
- ⚠️ **路径字符串**里的列表/表格索引**从 1 开始**，不是 0（适用于 `EI.subscribe` / `EI.read` / `EI.assign` 的 `path` 和 `EI.parse` 的模板）。传 0 行为未定义。通过 `EI.localVariables` / `EI.globalVariables` 直接访问得到的是原生 JS 数组/对象，下标仍然是 **0-based**，请注意不要混淆

## 最小示例：和沙盒变量同步的计数器

```html
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <!-- 声明设计尺寸 → 节点拖拽时整体等比缩放；绝大多数 UI 都应该写这行 -->
        <meta name="ei-design-size" content="320x180" />
    </head>
    <body
        class="w-full h-full flex flex-col items-center justify-center gap-2 bg-background text-foreground"
    >
        <div id="count" class="text-3xl font-bold tabular-nums">0</div>
        <button
            onclick="inc()"
            class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-80 transition"
        >
            +1
        </button>
        <script>
            const el = document.getElementById('count');
            const render = (v) => {
                el.textContent = v ?? 0;
            };
            // 等初始快照到达再读沙盒变量
            EI.onReady(() => {
                render(EI.localVariables.计数器);
                EI.subscribe('计数器', render);
            });
            async function inc() {
                const cur = (EI.localVariables.计数器 ?? 0) + 1;
                await EI.assign('计数器', cur);
            }
        </script>
    </body>
</html>
```

## 编码原则

1. 代码必须是**单个完整 HTML 文档**
2. **默认在 `<head>` 里声明 `<meta name="ei-design-size" content="宽x高">`**，让节点整体等比缩放；只有明确做"文本阅读型"界面才去掉它走响应式
3. 优先使用主题语义类（`bg-background` / `bg-primary` / `text-muted-foreground` / `border-border`）或 `--ei-*` CSS 变量适配主题，不要写死 `#fff` / `#000`
4. 需要外部资源时，直接写 `<img src="https://...">`，不要用 `fetch`
5. 修改沙盒变量一律走 `await EI.assign(...)`，不要尝试直接赋值 `EI.localVariables.x = ...`（不会生效）
6. 若读取的变量不存在，结果为 `undefined` 或 `"??"`；请做好空值处理
7. 引用角色 / 当前 / 骰子 / 计算等预设变量时，**用中文命名空间**（`角色.` / `当前.` / `骰子.` / `计算.`），不要用其他写法
8. **路径字符串**里列表/表格**索引从 1 开始**：`await EI.read('arr.1.xxx')` / `await EI.assign('arr.1.xxx', ...)` 而不是 `'arr.0.xxx'`。但用 `EI.localVariables.arr[0].xxx` 这种 JS 访问方式时数组下标仍是 **0-based** —— 不要把两种语义混用
9. **Vue Options API `data()` 里不要用 `_` 或 `$` 开头的字段名**（例如 `_subs` / `$timer`）：Vue 3 保留这些前缀给内部，不会代理到 `this`，模板里访问会报 `is not defined`。用 `subUnsubs` / `timerId` 这类普通名字
10. **`setInterval` / `setTimeout` 这类自动触发的 `EI.assign` 必须用 `if (EI.me === 'GM')` 来守卫**（详见上方"多客户端并发"小节）。用户点击触发的写入则一般不需要
