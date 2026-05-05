import { fileURLToPath, URL } from 'node:url';

import type { IndexHtmlTransformContext, Plugin } from 'vite';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

function toGlobalVueBindings(specifiers: string) {
    return specifiers
        .split(',')
        .map((specifier) => specifier.trim())
        .filter(Boolean)
        .map((specifier) => {
            const [imported, local] = specifier.split(/\s+as\s+/);
            if (!imported) {
                return '';
            }

            return local ? `${imported}: ${local}` : imported;
        })
        .filter(Boolean)
        .join(', ');
}

function externalizeVueRuntime(): Plugin {
    return {
        name: 'externalize-vue-runtime',
        apply: 'build',
        generateBundle(_, bundle) {
            for (const entry of Object.values(bundle)) {
                if (entry.type !== 'chunk' || !entry.code.includes(`from"vue"`)) {
                    continue;
                }

                entry.code = entry.code.replace(
                    /import\s*\{([^}]+)\}\s*from\s*"vue";?/g,
                    (_full: string, specifiers: string) => {
                        const bindings = toGlobalVueBindings(specifiers);
                        return `const __eiVue = window.Vue;
if (!__eiVue) {
    throw new Error('Echo Island did not inject global Vue before app bootstrap.');
}
const { ${bindings} } = __eiVue;`;
                    },
                );
            }
        },
    };
}

function inlineEchoIslandHtml(): Plugin {
    return {
        name: 'inline-echo-island-html',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            handler(html: string, ctx?: IndexHtmlTransformContext) {
                if (!ctx || !('bundle' in ctx) || !ctx.bundle) {
                    return html;
                }

                const bundle = ctx.bundle;
                const inlinedFiles = new Set<string>();
                const getFileName = (url: string) => url.replace(/^\.\//, '').replace(/^\//, '');

                let nextHtml = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

                nextHtml = nextHtml.replace(
                    /<link\b([^>]*?)href="([^"]+)"([^>]*?)>/g,
                    (full: string, before: string, href: string, after: string) => {
                        const isStylesheet = /rel="stylesheet"/.test(`${before}${after}`);
                        if (!isStylesheet) {
                            return full;
                        }

                        const fileName = getFileName(href);
                        const asset = bundle[fileName];
                        if (!asset || asset.type !== 'asset' || typeof asset.source !== 'string') {
                            return full;
                        }

                        inlinedFiles.add(fileName);
                        return `<style>${asset.source}</style>`;
                    },
                );

                nextHtml = nextHtml.replace(
                    /<script\b([^>]*?)src="([^"]+)"([^>]*)><\/script>/g,
                    (full: string, before: string, src: string, after: string) => {
                        const fileName = getFileName(src);
                        const chunk = bundle[fileName];
                        if (!chunk || chunk.type !== 'chunk') {
                            return full;
                        }

                        inlinedFiles.add(fileName);
                        const attributes = `${before} ${after}`
                            .replace(/\bcrossorigin\b/g, '')
                            .replace(/\s+/g, ' ')
                            .trim();

                        return `<script${attributes ? ` ${attributes}` : ''}>${chunk.code}</script>`;
                    },
                );

                for (const fileName of inlinedFiles) {
                    delete bundle[fileName];
                }

                return nextHtml;
            },
        },
    };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    base: './',
    publicDir: false,
    plugins: [
        vue(),
        command === 'serve' ? vueDevTools() : null,
        externalizeVueRuntime(),
        inlineEchoIslandHtml(),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    build: {
        cssCodeSplit: false,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        modulePreload: false,
        rollupOptions: {
            external: command === 'build' ? ['vue'] : [],
        },
    },
}));
