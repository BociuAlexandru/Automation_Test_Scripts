import { test, type Page, type TestInfo } from '@playwright/test';

const WATCHDOG_TIMEOUT_MS = 30_000;
const CLEANUP_REGISTRY = new WeakMap<Page, () => void>();
const GLOBAL_FLAG = '__SC_INACTIVITY_WATCHDOG_ENABLED__';

const globalAny = globalThis as Record<string, unknown>;

if (!globalAny[GLOBAL_FLAG]) {
    globalAny[GLOBAL_FLAG] = true;

    test.beforeEach(async ({ page }, testInfo) => {
        const cleanup = startInactivityWatchdog(page, testInfo, WATCHDOG_TIMEOUT_MS);
        CLEANUP_REGISTRY.set(page, cleanup);
    });

    test.afterEach(async ({ page }) => {
        const cleanup = CLEANUP_REGISTRY.get(page);
        cleanup?.();
        CLEANUP_REGISTRY.delete(page);
    });
}

function startInactivityWatchdog(page: Page, testInfo: TestInfo, timeoutMs: number) {
    let timer: NodeJS.Timeout | undefined;
    let lastSignal = 'initializing';

    const scheduleTimeout = () => {
        timer = setTimeout(() => {
            void handleTimeout();
        }, timeoutMs);
    };

    const handleTimeout = async () => {
        const message = `Inactivity watchdog: No browser activity for ${timeoutMs}ms during "${testInfo.title}" (last signal: ${lastSignal}).`;   
        console.error(message);
        try {
            await testInfo.attach('inactivity-watchdog', {
                body: Buffer.from(message, 'utf-8'),
                contentType: 'text/plain',
            });
        } catch {}

        try {
            await page.context().close();
        } catch {}
    };

    const resetTimer = (signal: string) => {
        lastSignal = signal;
        if (timer) {
            clearTimeout(timer);
        }
        scheduleTimeout();
    };

    const onRequest = () => resetTimer('request');
    const onRequestFinished = () => resetTimer('requestfinished');
    const onRequestFailed = () => resetTimer('requestfailed');
    const onResponse = () => resetTimer('response');
    const onFrameNavigated = () => resetTimer('framenavigated');
    const onDomContentLoaded = () => resetTimer('domcontentloaded');
    const onLoad = () => resetTimer('load');
    const onConsole = () => resetTimer('console');
    const onWebSocket = () => resetTimer('websocket');
    const onPopup = () => resetTimer('popup');
    const onFileChooser = () => resetTimer('filechooser');

    page.on('request', onRequest);
    page.on('requestfinished', onRequestFinished);
    page.on('requestfailed', onRequestFailed);
    page.on('response', onResponse);
    page.on('framenavigated', onFrameNavigated);
    page.on('domcontentloaded', onDomContentLoaded);
    page.on('load', onLoad);
    page.on('console', onConsole);
    page.on('websocket', onWebSocket);
    page.on('popup', onPopup);
    page.on('filechooser', onFileChooser);

    resetTimer('watchdog-start');

    return () => {
        if (timer) {
            clearTimeout(timer);
            timer = undefined;
        }
        page.off('request', onRequest);
        page.off('requestfinished', onRequestFinished);
        page.off('requestfailed', onRequestFailed);
        page.off('response', onResponse);
        page.off('framenavigated', onFrameNavigated);
        page.off('domcontentloaded', onDomContentLoaded);
        page.off('load', onLoad);
        page.off('console', onConsole);
        page.off('websocket', onWebSocket);
        page.off('popup', onPopup);
        page.off('filechooser', onFileChooser);
    };
}
