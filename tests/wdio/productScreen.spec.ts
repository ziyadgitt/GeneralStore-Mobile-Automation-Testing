import allure from '@wdio/allure-reporter';

const APP_ID = 'com.androidsample.generalstore';

async function attachScreenshot(name: string) {
    const screenshot = await browser.takeScreenshot();
    allure.addAttachment(name, Buffer.from(screenshot, 'base64'), 'image/png');
}

/**
 * A row button reads exactly "ADD TO CART" when the item is not in the cart and
 * "ADDED TO CART" when it is. Both contain "ADD", so the check has to be exact.
 */
function isAddButton(text: string): boolean {
    return text.trim().toUpperCase() === 'ADD TO CART';
}

/**
 * Reads the cart counter in the toolbar. The counter view only exists while the
 * cart holds something, so an absent counter means an empty cart.
 */
async function getCartCount(): Promise<number> {
    const counter = await $('id:com.androidsample.generalstore:id/counterText');
    if (!(await counter.isExisting())) return 0;

    const count = parseInt((await counter.getText()).trim(), 10);
    return Number.isNaN(count) ? 0 : count;
}

/**
 * Scrolls whichever product list is on screen (products grid or cart grid).
 * The gesture is scoped to the list element rather than to screen coordinates:
 * a screen swipe that reaches the bottom edge gets taken over by Android's
 * navigation gesture and minimises the app, and one that overshoots the cart
 * list — which only covers the top half of the screen — does not scroll at all.
 */
async function scrollList(direction: 'up' | 'down') {
    let list = await $('id:com.androidsample.generalstore:id/rvCartProductList');
    if (!(await list.isExisting())) {
        list = await $('id:com.androidsample.generalstore:id/rvProductList');
    }
    if (!(await list.isExisting())) return;

    await browser.execute('mobile: scrollGesture', {
        elementId: list.elementId,
        direction,
        percent: 1.0,
    });
    await browser.pause(400);
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

interface ProductRow {
    name: string;
    buttonText: string;
    addButton: WebdriverIO.Element | null;
}

/** The id of whichever list is on screen — the products list or the cart list. */
async function getListId(): Promise<string> {
    const cartList = await $('id:com.androidsample.generalstore:id/rvCartProductList');
    return (await cartList.isExisting()) ? 'rvCartProductList' : 'rvProductList';
}

/**
 * One entry per list cell. Each cell is read on its own instead of zipping a flat
 * list of names against a flat list of buttons: a cell that is only half attached
 * contributes a name without a button (or the reverse), which shifts every later
 * index and silently skips a product.
 */
async function getVisibleRows(): Promise<ProductRow[]> {
    const listId = await getListId();
    const cells = await $$(`//*[@resource-id="com.androidsample.generalstore:id/${listId}"]/*`).getElements();
    const rows: ProductRow[] = [];

    for (const cell of cells) {
        const nameEl = await cell.$('.//*[@resource-id="com.androidsample.generalstore:id/productName"]');
        const buttonEl = await cell.$('.//*[@resource-id="com.androidsample.generalstore:id/productAddCart"]');
        const hasButton = await buttonEl.isExisting();

        rows.push({
            name: (await nameEl.isExisting()) ? await nameEl.getText() : '',
            buttonText: hasButton ? await buttonEl.getText() : '',
            addButton: hasButton ? await buttonEl.getElement() : null,
        });
    }
    return rows;
}

async function getFirstVisibleProductName(): Promise<string> {
    const names = await $$('id:com.androidsample.generalstore:id/productName').getElements();
    return names.length > 0 ? await names[0].getText() : '';
}

/**
 * The first scroll after opening a screen is sometimes absorbed by the list
 * settling, so callers stop after two fruitless rounds rather than one.
 */
const IDLE_ROUNDS_BEFORE_STOP = 2;

async function scrollToTop() {
    let idle = 0;
    for (let i = 0; i < 15 && idle < IDLE_ROUNDS_BEFORE_STOP; i++) {
        const before = await getFirstVisibleProductName();
        await scrollList('up');
        idle = (await getFirstVisibleProductName()) === before ? idle + 1 : 0;
    }
}

/** Walks the product list top-to-bottom and returns every product name. */
async function collectAllProductNames(): Promise<string[]> {
    await scrollToTop();
    const names: string[] = [];

    let idle = 0;
    for (let i = 0; i < 20 && idle < IDLE_ROUNDS_BEFORE_STOP; i++) {
        let foundNew = false;
        for (const row of await getVisibleRows()) {
            if (row.name && !names.includes(row.name)) {
                names.push(row.name);
                foundNew = true;
            }
        }

        const lastBefore = await getFirstVisibleProductName();
        await scrollList('down');
        // Stop once the list no longer moves and nothing new shows up
        const moved = (await getFirstVisibleProductName()) !== lastBefore;
        idle = foundNew || moved ? 0 : idle + 1;
    }

    await scrollToTop();
    return names;
}

/** Adds items from the top of the list until `limit` items are in the cart. Returns their names. */
async function addItemsToCart(limit: number): Promise<string[]> {
    const added: string[] = [];

    // The list is a two-column grid, so a single top-to-bottom pass can leave a
    // cell behind when a row scrolls in half-visible. Sweep again from the top
    // until the limit is met — items already in the cart read "ADDED TO CART"
    // and are skipped, so repeated passes are harmless.
    for (let pass = 0; pass < 3 && added.length < limit; pass++) {
        await scrollToTop();

        let idle = 0;
        for (let i = 0; i < 20 && added.length < limit && idle < IDLE_ROUNDS_BEFORE_STOP; i++) {
            for (const row of await getVisibleRows()) {
                if (added.length >= limit) break;
                if (!row.addButton || !isAddButton(row.buttonText)) continue;

                await row.addButton.click();
                await browser.pause(400);
                if (row.name && !added.includes(row.name)) added.push(row.name);
            }

            if (added.length >= limit) break;

            const lastBefore = await getFirstVisibleProductName();
            await scrollList('down');
            idle = (await getFirstVisibleProductName()) === lastBefore ? idle + 1 : 0;
        }
    }

    return added;
}

/** Removes every item currently in the cart from the Products screen. */
async function clearCart() {
    if ((await getCartCount()) === 0) return;
    await scrollToTop();

    for (let i = 0; i < 20 && (await getCartCount()) > 0; i++) {
        for (const row of await getVisibleRows()) {
            if (!row.addButton || isAddButton(row.buttonText)) continue;

            await row.addButton.click();
            await browser.pause(400);
        }

        if ((await getCartCount()) === 0) break;

        const lastBefore = await getFirstVisibleProductName();
        await scrollList('down');
        if ((await getFirstVisibleProductName()) === lastBefore) {
            await scrollToTop(); // wrap around for rows above the current viewport
        }
    }
}

async function isOnCartScreen(): Promise<boolean> {
    return (await browser.getCurrentActivity()).includes('CartActivity');
}

/**
 * Taps the cart icon and reports whether the Cart screen opened. With an empty
 * cart the app stays on the products list and shows a "Please add some product
 * at first" toast instead of navigating.
 */
async function openCart(): Promise<boolean> {
    const cartBtn = await $('id:com.androidsample.generalstore:id/appbar_btn_cart');
    await cartBtn.waitForDisplayed({ timeout: 10000 });
    await cartBtn.click();
    await browser.pause(1500);
    return isOnCartScreen();
}

/** Scrolls the Cart screen and returns every product name listed there. */
async function collectCartItemNames(): Promise<string[]> {
    // Guard against reading the products list when the cart never opened
    if (!(await isOnCartScreen())) return [];

    const names: string[] = [];

    let idle = 0;
    for (let i = 0; i < 20 && idle < IDLE_ROUNDS_BEFORE_STOP; i++) {
        let foundNew = false;
        for (const el of await $$('id:com.androidsample.generalstore:id/productName').getElements()) {
            const text = await el.getText();
            if (text && !names.includes(text)) {
                names.push(text);
                foundNew = true;
            }
        }

        const lastBefore = await getFirstVisibleProductName();
        await scrollList('down');
        const moved = (await getFirstVisibleProductName()) !== lastBefore;
        idle = foundNew || moved ? 0 : idle + 1;
    }

    return names;
}

async function backToProducts() {
    if (await isOnCartScreen()) {
        await browser.back();
        await browser.pause(1500);
    }
    await ensureProductsScreen();
    await scrollToTop();
}

describe('General Store - Products Screen', () => {
    before(async () => {
        // Launch app once for all tests (cold-start)
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

        // Navigate to Products screen from Landing screen
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.waitForDisplayed({ timeout: 10000 });
        await nameField.click();
        await nameField.clearValue();
        await nameField.addValue('Test User');
        await browser.hideKeyboard().catch(() => undefined);

        const letsShopButton = await $('id:com.androidsample.generalstore:id/btnLetsShop');
        await letsShopButton.click();
        await browser.pause(3000);

        // Verify we are on the Products screen
        const toolbarTitle = await $('id:com.androidsample.generalstore:id/toolbar_title');
        await toolbarTitle.waitForDisplayed({ timeout: 10000 });
        await $('id:com.androidsample.generalstore:id/rvProductList').waitForExist({ timeout: 10000 });
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

    it('TC003-1: Verify Products Screen rendered correctly - Scrolls smoothly in both directions', async () => {
        await ensureProductsScreen();
        const { width, height } = await browser.getWindowSize();

        // Step 1: Scroll to bottom of the screen.
        // Keep the gesture clear of the bottom edge: a swipe that ends there is
        // taken over by Android's navigation gesture and minimises the app.
        let prevContent = '';
        let currentContent = '';
        for (let i = 0; i < 15; i++) {
            await browser.execute('mobile: swipeGesture', {
                left: width / 4,
                top: height * 0.35,
                width: width / 2,
                height: height * 0.3,
                direction: 'up',
                percent: 0.75,
            });
            await browser.pause(500);

            const items = await $$('android.widget.TextView').getElements();
            currentContent = items.length > 0 ? await items[items.length - 1].getText() : '';
            if (currentContent === prevContent) break;
            prevContent = currentContent;
        }

        // Verify bottom content is visible; page reached end
        await attachScreenshot('Products Screen - Bottom reached');

        // Scroll back to top of the screen
        prevContent = '';
        for (let i = 0; i < 15; i++) {
            await browser.execute('mobile: swipeGesture', {
                left: width / 4,
                top: height * 0.3,
                width: width / 2,
                height: height * 0.3,
                direction: 'down',
                percent: 0.75,
            });
            await browser.pause(500);

            const items = await $$('android.widget.TextView').getElements();
            currentContent = items.length > 0 ? await items[0].getText() : '';
            if (currentContent === prevContent) break;
            prevContent = currentContent;
        }

        // Verify top content is visible; page reached start
        const toolbarTitle = await $('id:com.androidsample.generalstore:id/toolbar_title');
        expect(await toolbarTitle.isDisplayed()).toBe(true);
        await attachScreenshot('Products Screen - Top reached');

        // Step 2: Fast fling down
        await browser.execute('mobile: flingGesture', {
            left: width / 4,
            top: height * 0.3,
            width: width / 2,
            height: height * 0.35,
            direction: 'down',
            speed: 15000,
        });
        await browser.pause(1000);
        await attachScreenshot('Products Screen - After fast fling down');

        // Fast fling up
        await browser.execute('mobile: flingGesture', {
            left: width / 4,
            top: height * 0.3,
            width: width / 2,
            height: height * 0.35,
            direction: 'up',
            speed: 15000,
        });
        await browser.pause(1000);
        await attachScreenshot('Products Screen - After fast fling up');

        // Verify the screen is still responsive after fast flings (no freeze/crash)
        expect(await toolbarTitle.isDisplayed()).toBe(true);
    });

    it('TC003-2: Verify Item able to be added to cart', async () => {
        // Start from a known state: products screen, top of the list, empty cart
        await ensureProductsScreen();
        await scrollToTop();
        await clearCart();
        expect(await getCartCount()).toBe(0);

        const allProducts = await collectAllProductNames();
        expect(allProducts.length).toBeGreaterThan(0);

        // Step 1: Add 1 item to cart
        const firstAdded = await addItemsToCart(1);
        expect(firstAdded.length).toBe(1);

        // Cart count increases to 1
        expect(await getCartCount()).toBe(1);
        await attachScreenshot(`Cart - "${firstAdded[0]}" added, count 1`);

        // Item appears in cart
        expect(await openCart()).toBe(true);
        let cartItems = await collectCartItemNames();
        expect(cartItems.length).toBe(1);
        expect(cartItems).toContain(firstAdded[0]);
        await attachScreenshot(`Cart Screen - Contains "${firstAdded[0]}"`);
        await backToProducts();

        // Step 2: Remove from cart
        await scrollToTop();
        const removeButtons = await $$('id:com.androidsample.generalstore:id/productAddCart').getElements();
        await removeButtons[0].click();
        await browser.pause(500);

        // Cart count decreases to 0 and the row button flips back to "ADD TO CART"
        expect(await getCartCount()).toBe(0);
        const buttonsAfterRemove = await $$('id:com.androidsample.generalstore:id/productAddCart').getElements();
        expect(isAddButton(await buttonsAfterRemove[0].getText())).toBe(true);
        await attachScreenshot('Cart - Item removed, count 0');

        // Cart becomes empty: the app refuses to open an empty cart and toasts instead
        const emptyCartOpened = await openCart();
        expect(emptyCartOpened).toBe(false);
        cartItems = await collectCartItemNames();
        expect(cartItems.length).toBe(0);

        const emptyToast = await $('android=new UiSelector().textContains("add some product")');
        if (await emptyToast.isExisting()) {
            expect((await emptyToast.getText()).toLowerCase()).toContain('add some product');
        }
        await attachScreenshot('Cart - Empty, cart screen refuses to open');
        await backToProducts();

        // Step 3: Add again to cart
        const reAdded = await addItemsToCart(1);
        expect(reAdded.length).toBe(1);
        expect(reAdded[0]).toBe(firstAdded[0]); // the same item is added back

        // Cart count increases to 1 again
        expect(await getCartCount()).toBe(1);
        await attachScreenshot(`Cart - "${reAdded[0]}" re-added, count 1`);

        // Item appears in cart again
        expect(await openCart()).toBe(true);
        cartItems = await collectCartItemNames();
        expect(cartItems.length).toBe(1);
        expect(cartItems).toContain(reAdded[0]);
        await attachScreenshot(`Cart Screen - "${reAdded[0]}" present again`);
        await backToProducts();

        // Step 4: Add 2 items to cart
        await clearCart();
        expect(await getCartCount()).toBe(0);
        const twoAdded = await addItemsToCart(2);
        expect(twoAdded.length).toBe(2);
        expect(twoAdded[0]).not.toBe(twoAdded[1]); // 2 different items

        // Cart count increases to 2
        expect(await getCartCount()).toBe(2);
        await attachScreenshot(`Cart - 2 items added: ${twoAdded.join(', ')}`);

        // Both items appear in cart
        expect(await openCart()).toBe(true);
        cartItems = await collectCartItemNames();
        expect(cartItems.length).toBe(2);
        for (const name of twoAdded) {
            expect(cartItems).toContain(name);
        }
        await attachScreenshot(`Cart Screen - Both items present: ${twoAdded.join(', ')}`);
        await backToProducts();

        // Step 5: Add all items to cart
        await clearCart();
        expect(await getCartCount()).toBe(0);
        const allAdded = await addItemsToCart(allProducts.length);
        expect(allAdded.length).toBe(allProducts.length);

        // Cart count reflects total items
        expect(await getCartCount()).toBe(allProducts.length);
        await attachScreenshot(`Cart - All ${allProducts.length} items added`);

        // All items appear in cart
        expect(await openCart()).toBe(true);
        cartItems = await collectCartItemNames();
        expect(cartItems.length).toBe(allProducts.length);
        for (const name of allProducts) {
            expect(cartItems).toContain(name);
        }
        await attachScreenshot(`Cart Screen - All ${allProducts.length} items present`);

        await backToProducts();
        await clearCart();
    });
});