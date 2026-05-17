import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

function mountApp() {
    const mountTarget = document.getElementById('app');
    if (!mountTarget) {
        throw new Error('Echo Island mount target "#app" was not found.');
    }

    createApp(App).mount(mountTarget);
}

async function bootstrap() {
    if (import.meta.env.DEV) {
        const { installEchoIslandMock } = await import('../mocks/installEchoIslandMock');
        installEchoIslandMock();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountApp, { once: true });
        return;
    }

    mountApp();
}

void bootstrap();
