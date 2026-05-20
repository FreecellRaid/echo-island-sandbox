<template>
    <section class="demo-panel">
        <p class="eyebrow">Cursor Mask Test</p>
        <h1>自定义光标测试</h1>

        <div class="demo-grid">
            <button type="button" class="demo-card pointer-card">
                <span class="card-label">pointer</span>
                <strong>悬停按钮</strong>
            </button>

            <label class="demo-card text-card">
                <span class="card-label">text</span>
                <input type="text" value="文本输入" readonly />
            </label>

            <div class="demo-card crosshair-card">
                <span class="card-label">crosshair</span>
                <div class="crosshair-target" aria-hidden="true"></div>
            </div>

            <div class="demo-card move-card" tabindex="0">
                <span class="card-label">move</span>
                <strong>拖拽光标</strong>
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
    background-color: var(--ei-bg);
    color: var(--ei-fg);
}

.eyebrow {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ei-primary);
}

h1 {
    margin: 0;
    font-size: clamp(30px, 4vw, 48px);
    line-height: 1.05;
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
    text-align: left;
    border: 1px solid var(--ei-border);
    border-radius: 12px;
    background-color: var(--ei-muted);
}

.demo-card strong {
    font-size: 22px;
    font-weight: 600;
}

.card-label {
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ei-primary);
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
    padding: 12px 2px;
    background: var(--ei-bg);
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
    border: 1px dashed var(--ei-primary);
    background:
        linear-gradient(90deg, transparent 49%, var(--ei-primary) 50%, transparent 51%),
        linear-gradient(transparent 49%, var(--ei-primary) 50%, transparent 51%);
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
