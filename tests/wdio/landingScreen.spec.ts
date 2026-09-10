import allure from '@wdio/allure-reporter';

async function attachScreenshot(name: string) {
    const screenshot = await browser.takeScreenshot();
    allure.addAttachment(name, Buffer.from(screenshot, 'base64'), 'image/png');
}

describe('General Store - App Launch', () => {
    beforeEach(async () => {
        const APP_ID = 'com.androidsample.generalstore';

        // Force-stop the app if running
        await browser.terminateApp(APP_ID);
        // Wait for the app to fully terminate
        await browser.pause(1000);

        // Verify the app is not running before cold-start
        const state = await browser.queryAppState(APP_ID);
        // state 1 = not running, 2 = background, 3 = suspended, 4 = foreground
        if (state !== 1) {
            await browser.terminateApp(APP_ID);
            await browser.pause(1000);
        }

        // Cold-start the app
        await browser.activateApp(APP_ID);
        // Wait for splash screen to transition to landing screen
        await browser.pause(3000);

        await browser.startRecordingScreen();
    });

    afterEach(async function () {
        const video = await browser.stopRecordingScreen();
        const videoBuffer = Buffer.from(video, 'base64');

        // Attach video to Allure report
        allure.addAttachment(
            `Video - ${this.currentTest?.title}`,
            videoBuffer,
            'video/mp4'
        );

        // Auto-capture screenshot on test failure
        if (this.currentTest?.state === 'failed') {
            await attachScreenshot(`FAILED - ${this.currentTest.title}`);
        }
    });

    it('TC001-1: Launch App cold-start from Home - App opens on Landing Screen', async () => {
        // Verify the app package is the General Store
        const currentPackage = await browser.getCurrentPackage();
        expect(currentPackage).toBe('com.androidsample.generalstore');

        // Verify the landing screen activity is displayed
        const currentActivity = await browser.getCurrentActivity();
        expect(currentActivity).toContain('MainActivity');

        // Verify key landing screen elements are visible
        const toolbarTitle = await $('id:com.androidsample.generalstore:id/toolbar_title');
        await toolbarTitle.waitForDisplayed({ timeout: 10000 });
        expect(await toolbarTitle.getText()).toBe('General Store');

        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        expect(await nameField.isDisplayed()).toBe(true);

        const letsShopButton = await $('id:com.androidsample.generalstore:id/btnLetsShop');
        expect(await letsShopButton.isDisplayed()).toBe(true);

        // Capture screenshot of landing screen as expected outcome evidence
        await attachScreenshot('Landing Screen - Expected Outcome');
    });
});
