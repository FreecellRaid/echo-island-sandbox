<script setup lang="ts">
import CustomCursor from '@/components/customCursor/CustomCursor.vue';
import CursorTestPanel from '@/components/customCursor/CursorTestPanel.vue';
</script>

<template>
    <main class="app-shell">
        <CustomCursor />
        <CursorTestPanel />
    </main>
</template>

<style scoped>
.app-shell {
    box-sizing: border-box;
    width: 100%;
    min-height: 100%;
    padding: 32px;
}
</style>
