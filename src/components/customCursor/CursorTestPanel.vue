<template>
    <section class="demo-panel">
        <p class="eyebrow">Cursor Mask Test</p>
        <h1>自定义光标遮罩测试场景</h1>
        <p class="summary">
            光标资源来自 `变量.cursor`，尺寸来自 `变量.config`。只有当前 cursor
            类型存在资源时，才会隐藏系统光标并显示遮罩。
        </p>

        <div class="demo-grid">
            <button type="button" class="demo-card pointer-card">
                <span class="card-label">pointer</span>
                <strong>悬停按钮</strong>
            </button>

            <label class="demo-card text-card">
                <span class="card-label">text</span>
                <input type="text" value="文本输入光标测试" readonly />
            </label>

            <div class="demo-card crosshair-card">
                <span class="card-label">crosshair</span>
                <div class="crosshair-target" aria-hidden="true"></div>
            </div>

            <div class="demo-card move-card" tabindex="0">
                <span class="card-label">move</span>
                <strong>拖拽区占位</strong>
            </div>

            <button type="button" class="demo-card grab-card">
                <span class="card-label">grab</span>
                <strong>抓取手势</strong>
            </button>

            <button type="button" class="demo-card wait-card">
                <span class="card-label">wait</span>
                <strong>等待状态</strong>
            </button>

            <button type="button" class="demo-card blocked-card" disabled>
                <span class="card-label">not-allowed</span>
                <strong>禁用按钮</strong>
            </button>
        </div>
    </section>
</template>

<style scoped>
.demo-panel {
    box-sizing: border-box;
    max-width: 1040px;
    margin: 0 auto;
    padding: 28px;
    border: 1px solid rgb(148 163 184 / 0.18);
    border-radius: 28px;
    background:
        linear-gradient(180deg, rgb(10 37 64 / 0.72), rgb(11 18 32 / 0.84)),
        radial-gradient(circle at top left, rgb(34 211 238 / 0.24), transparent 32%);
    box-shadow: 0 24px 80px rgb(15 23 42 / 0.42);
    backdrop-filter: blur(18px);
}

.eyebrow {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgb(103 232 249 / 0.84);
}

h1 {
    margin: 0;
    font-size: clamp(30px, 4vw, 48px);
    line-height: 1.05;
}

.summary {
    max-width: 680px;
    margin: 16px 0 0;
    font-size: 15px;
    line-height: 1.7;
    color: rgb(226 232 240 / 0.78);
}

.demo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-top: 28px;
}

.demo-card {
    display: grid;
    align-content: start;
    gap: 12px;
    min-height: 150px;
    padding: 20px;
    color: inherit;
    text-align: left;
    border: 1px solid rgb(148 163 184 / 0.18);
    border-radius: 20px;
    background: linear-gradient(180deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.02));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04);
}

.demo-card strong {
    font-size: 22px;
    font-weight: 600;
}

.card-label {
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgb(125 211 252 / 0.86);
}

button.demo-card,
input {
    font: inherit;
}

.pointer-card {
    cursor: pointer;
}

.text-card input {
    width: 100%;
    padding: 14px 16px;
    color: rgb(226 232 240 / 0.94);
    background: rgb(15 23 42 / 0.42);
    border: 1px solid rgb(148 163 184 / 0.18);
    border-radius: 14px;
    cursor: text;
}

.crosshair-card,
.crosshair-target {
    cursor: crosshair;
}

.crosshair-target {
    position: relative;
    min-height: 84px;
    border-radius: 18px;
    border: 1px dashed rgb(103 232 249 / 0.38);
    background:
        linear-gradient(90deg, transparent 49%, rgb(103 232 249 / 0.3) 50%, transparent 51%),
        linear-gradient(transparent 49%, rgb(103 232 249 / 0.3) 50%, transparent 51%);
}

.move-card {
    cursor: move;
}

.grab-card {
    cursor: grab;
}

.wait-card {
    cursor: wait;
}

.blocked-card:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

@media (max-width: 720px) {
    .app-shell {
        padding: 18px;
    }

    .demo-panel {
        padding: 22px;
        border-radius: 24px;
    }

    .demo-card {
        min-height: 132px;
    }
}
</style>
