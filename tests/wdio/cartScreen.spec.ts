import allure from '@wdio/allure-reporter';

const APP_ID = 'com.androidsample.generalstore';

async function attachScreenshot(name: string) {
    const screenshot = await browser.takeScreenshot();
    allure.addAttachment(name, Buffer.from(screenshot, 'base64'), 'image/png');
}

/** Brings the app back to the Products screen if anything knocked it off course. */
async function ensureProductsScreen() {
    if ((await browser.getCurrentPackage()) !== APP_ID) {
        await browser.activateApp(APP_ID);
        await browser.pause(2000);
    }

    // The cart screen is one back press away from the products list
    if ((await browser.getCurrentActivity()).includes('CartActivity')) {
        await browser.back();
        await browser.pause(1500);
    }

    // Still on the landing screen: fill the form and shop
    const nameField = await $('id:com.androidsample.generalstore:id/nameField');
    if (await nameField.isExisting()) {
        await nameField.click();
        await nameField.clearValue();
        await nameField.addValue('Test User');
        await browser.hideKeyboard().catch(() => undefined);
        await (await $('id:com.androidsample.generalstore:id/btnLetsShop')).click();
        await browser.pause(2500);
    }

    await $('id:com.androidsample.generalstore:id/rvProductList').waitForExist({ timeout: 10000 });
}

describe('General Store - Cart Screen', () => {
    before(async () => {
        // Launch app once for all tests (cold-start), which also empties the cart
        await browser.terminateApp(APP_ID);
        await browser.pause(1000);
        const state = await browser.queryAppState(APP_ID);
        if (state !== 1) {
            await browser.terminateApp(APP_ID);
            await browser.pause(1000);
        }
        await browser.activateApp(APP_ID);

        // Wait out the splash screen before touching the landing screen
        await browser.waitUntil(
            async () => (await browser.getCurrentPackage()) === APP_ID
                && !(await browser.getCurrentActivity()).includes('Splash'),
            { timeout: 20000, timeoutMsg: 'App did not reach the landing screen' }
        );

        // Navigate to the Products screen
        await ensureProductsScreen();
    });

    beforeEach(async () => {
        await browser.startRecordingScreen();
    });

    afterEach(async function () {
        const video = await browser.stopRecordingScreen();
        const videoBuffer = Buffer.from(video, 'base64');
        allure.addAttachment(
            `Video - ${this.currentTest?.title}`,
            videoBuffer,
            'video/mp4'
        );
        if (this.currentTest?.state === 'failed') {
            await attachScreenshot(`FAILED - ${this.currentTest.title}`);
        }
    });

    it('TC004-1: Verify Cart Screen unable to be accessed without any items in cart', async () => {
        await ensureProductsScreen();

        // Precondition: the cart is empty. The counter badge only exists once
        // something has been added, so its absence means an empty cart.
        const counter = await $('id:com.androidsample.generalstore:id/counterText');
        expect(await counter.isExisting()).toBe(false);

        // Tap the cart icon
        const cartButton = await $('id:com.androidsample.generalstore:id/appbar_btn_cart');
        await cartButton.waitForDisplayed({ timeout: 10000 });
        await cartButton.click();
        await browser.pause(1000);

        // Verify we are still on the Products screen - the Cart screen never opened
        expect(await browser.getCurrentActivity()).not.toContain('CartActivity');

        const toolbarTitle = await $('id:com.androidsample.generalstore:id/toolbar_title');
        await toolbarTitle.waitForDisplayed({ timeout: 10000 });
        await expect(toolbarTitle).toHaveText('Products');

        // The app explains why with a toast instead of navigating
        const toast = await $('android=new UiSelector().textContains("add some product")');
        if (await toast.isExisting()) {
            expect((await toast.getText()).toLowerCase()).toContain('add some product');
        }

        await attachScreenshot('Cart Screen blocked - "Please add some product at first"');
    });

    it('TC004-2: Verify Cart Screen rendered correctly', async () => {
        /** How many items are in the cart. No badge on screen means empty. */
    async function getCartCount(): Promise<number> {
        const counter = await $('id:com.androidsample.generalstore:id/counterText');
        if (!(await counter.isExisting())) return 0;

        const count = parseInt((await counter.getText()).trim(), 10);
        return Number.isNaN(count) ? 0 : count;
        }
    });

    /** Adds the first product that isn't in the cart yet. Returns its name. */
    async function addItemToCart(): Promise<string> {
        const cells = await $$('//*[@resource-id="com.androidsample.generalstore:id/rvProductList"]/*').getElements();

        for (const cell of cells) {
            const button = await cell.$('.//*[@resource-id="com.androidsample.generalstore:id/productAddCart"]');
            const nameEl = await cell.$('.//*[@resource-id="com.androidsample.generalstore:id/productName"]');
            if (!(await button.isExisting()) || !(await nameEl.isExisting())) continue;
            if ((await button.getText()).trim().toUpperCase() !== 'ADD TO CART') continue;

            const name = await nameEl.getText();
            await button.click();
            await browser.pause(500);
            return name;
        }
        throw new Error('No product available to add to the cart');
    }

});
