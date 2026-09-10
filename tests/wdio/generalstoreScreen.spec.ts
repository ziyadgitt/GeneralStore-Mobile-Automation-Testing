import allure from '@wdio/allure-reporter';

const APP_ID = 'com.androidsample.generalstore';

async function attachScreenshot(name: string) {
    const screenshot = await browser.takeScreenshot();
    allure.addAttachment(name, Buffer.from(screenshot, 'base64'), 'image/png');
}

describe('General Store - Country Selection', () => {
    const selectedCountries: string[] = [];

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
        await browser.pause(3000);
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

    it('TC002-1: Select Country dropdown - Dropdown opens and shows all countries', async () => {
        const spinner = await $('id:com.androidsample.generalstore:id/spinnerCountry');
        await spinner.waitForDisplayed({ timeout: 10000 });
        await spinner.click();
        await browser.pause(1000);

        // Verify the dropdown list is open by checking for list items
        const firstItem = await $('android=new UiSelector().className("android.widget.TextView").textContains("")');
        await firstItem.waitForDisplayed({ timeout: 5000 });
        expect(await firstItem.isDisplayed()).toBe(true);

        await attachScreenshot('Country Dropdown - Open with all countries');

        // Dismiss the dropdown by tapping the spinner area again
        const { width } = await browser.getWindowSize();
        await browser.execute('mobile: clickGesture', { x: width / 2, y: 50 });
        await browser.pause(1000);
    });

    it('TC002-2: Select first country - First country is selected and displayed', async () => {
        const spinner = await $('id:com.androidsample.generalstore:id/spinnerCountry');
        await spinner.waitForDisplayed({ timeout: 10000 });
        await spinner.click();

        // Select the first country in the list
        const firstCountry = await $('android=new UiSelector().className("android.widget.TextView").index(0)');
        await firstCountry.waitForDisplayed({ timeout: 5000 });
        const firstCountryText = await firstCountry.getText();
        await firstCountry.click();

        // Verify the selected country is displayed on the spinner
        const selectedText = await $('id:android:id/text1');
        await selectedText.waitForDisplayed({ timeout: 5000 });
        expect(await selectedText.getText()).toBe(firstCountryText);

        selectedCountries.push(firstCountryText);
        await attachScreenshot(`First Country Selected - ${firstCountryText}`);
    });

    it('TC002-3: Select last country - Last country is selected and displayed', async () => {
        const spinner = await $('id:com.androidsample.generalstore:id/spinnerCountry');
        await spinner.waitForDisplayed({ timeout: 10000 });
        await spinner.click();

        // Scroll to the bottom of the dropdown list
        let lastText = '';
        let prevText = '';
        const { width, height } = await browser.getWindowSize();

        // Keep scrolling until we can't scroll anymore
        for (let i = 0; i < 20; i++) {
            // Fast fling gesture covering most of the screen
            await browser.execute('mobile: flingGesture', {
                left: width / 4,
                top: height * 0.3,
                width: width / 2,
                height: height * 0.5,
                direction: 'down',
                speed: 15000,
            });

            await browser.pause(300);

            // Check if we've reached the end (no new items appearing)
            const items = await $$('android.widget.TextView').getElements();
            if (items.length > 0) {
                lastText = await items[items.length - 1].getText();
                if (lastText === prevText) break; // Reached the end
                prevText = lastText;
            }
        }

        // Select the last visible item
        const lastItems = await $$('android.widget.TextView').getElements();
        const lastCountry = lastItems[lastItems.length - 1];
        const lastCountryText = await lastCountry.getText();
        await lastCountry.click();

        // Verify the selected country is displayed
        const selectedText = await $('id:android:id/text1');
        await selectedText.waitForDisplayed({ timeout: 5000 });
        expect(await selectedText.getText()).toBe(lastCountryText);

        selectedCountries.push(lastCountryText);
        await attachScreenshot(`Last Country Selected - ${lastCountryText}`);
    });

    it('TC002-4: Scroll dropdown and randomly select a country', async () => {
        const spinner = await $('id:com.androidsample.generalstore:id/spinnerCountry');
        await spinner.waitForDisplayed({ timeout: 10000 });
        await spinner.click();
        await browser.pause(1000);

        // Scroll down a random number of times (2-6)
        const { width, height } = await browser.getWindowSize();
        const scrollCount = Math.floor(Math.random() * 5) + 2;
        for (let i = 0; i < scrollCount; i++) {
            await browser.execute('mobile: swipeGesture', {
                left: width / 2 - 50,
                top: height * 0.6,
                width: 100,
                height: height * 0.3,
                direction: 'up',
                percent: 0.5,
            });
            await browser.pause(300);
        }

        // Get only the dropdown list items (android.widget.CheckedTextView inside the dropdown)
        let dropdownItems = await $$('android.widget.CheckedTextView').getElements();
        // Fallback: if no CheckedTextView, use TextView inside the dropdown list
        if (dropdownItems.length === 0) {
            dropdownItems = await $$('android=new UiSelector().resourceId("android:id/text1")').getElements();
        }
        if (dropdownItems.length === 0) {
            dropdownItems = await $$('android=new UiSelector().className("android.widget.TextView").clickable(true)').getElements();
        }

        // Filter out countries already selected in previous tests
        const candidates: { element: WebdriverIO.Element; text: string }[] = [];
        for (const item of dropdownItems) {
            const text = await item.getText();
            if (text && !selectedCountries.includes(text)) {
                candidates.push({ element: item, text });
            }
        }

        // Pick a random country from filtered candidates
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const randomCountryText = pick.text;
        await pick.element.click();

        // Verify the randomly selected country is displayed
        const selectedText = await $('id:android:id/text1');
        await selectedText.waitForDisplayed({ timeout: 5000 });
        expect(await selectedText.getText()).toBe(randomCountryText);

        // Confirm it's different from previously selected countries
        expect(selectedCountries).not.toContain(randomCountryText);
        selectedCountries.push(randomCountryText);

        await attachScreenshot(`Random Country Selected - ${randomCountryText}`);
    });
});

describe('General Store - Name Textbar Functioning', () => {
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

    it('TC003-5: Leave name blank - Validation message appears', async () => {
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.waitForDisplayed({ timeout: 10000 });

        // Ensure the field is empty
        await nameField.clearValue();
        await browser.pause(300);

        // Verify the field is empty
        const fieldText = await nameField.getText();
        const isEmpty = !fieldText || fieldText === '' || fieldText === 'Enter name here';
        expect(isEmpty).toBe(true);

        // Tap "Let's Shop" button to trigger validation
        const letsShopBtn = await $('id:com.androidsample.generalstore:id/btnLetsShop');
        await letsShopBtn.click();
        await browser.pause(1000);

        // Verify a toast/validation message appears (e.g., "Please enter your name")
        const toast = await $('android=new UiSelector().textContains("enter your name")');
        const toastDisplayed = await toast.waitForDisplayed({ timeout: 5000 }).catch(() => false);

        if (toastDisplayed) {
            const toastText = await toast.getText();
            expect(toastText.toLowerCase()).toContain('enter your name');
        } else {
            // Fallback: check if we're still on the same screen (didn't navigate away)
            const nameFieldStillVisible = await nameField.isDisplayed();
            expect(nameFieldStillVisible).toBe(true);
        }

        await attachScreenshot('Name Textbar - Empty field with validation message');
    });

    it('TC002-6: Select Name textbar - Textbar is focused and ready for input', async () => {
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.waitForDisplayed({ timeout: 10000 });

        // Tap the name field to focus it
        await nameField.click();
        await browser.pause(500);

        // Verify the field is focused by checking that the keyboard is displayed
        const isKeyboardShown = await browser.isKeyboardShown();
        expect(isKeyboardShown).toBe(true);

        await attachScreenshot('Name Textbar - Focused and ready for input');

        // Clear the field for next test
        await nameField.clearValue();
    });

    it('TC002-7: Fill in with common name - Name is entered and displayed', async () => {
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.waitForDisplayed({ timeout: 10000 });

        // Tap field to focus, then type via keyboard
        await nameField.click();
        await browser.pause(300);
        await nameField.clearValue();
        await browser.pause(300);
        await nameField.addValue('John Smith');
        await browser.pause(500);

        // Hide keyboard to see the field clearly
        await browser.hideKeyboard();
        await browser.pause(300);

        // Verify the entered text is displayed in the field
        const fieldText = await nameField.getText();
        expect(fieldText).toBe('John Smith');

        await attachScreenshot('Name Textbar - Common name "John Smith" entered');

        // Clear for next test
        await nameField.clearValue();
    });

    it('TC002-8: Fill in with all small letters - Lowercase text is entered and displayed', async () => {
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.waitForDisplayed({ timeout: 10000 });

        // Tap field to focus, then type via keyboard
        await nameField.click();
        await browser.pause(300);
        await nameField.clearValue();
        await browser.pause(300);
        await nameField.addValue('john smith');
        await browser.pause(500);

        // Hide keyboard to see the field clearly
        await browser.hideKeyboard();
        await browser.pause(300);

        // Verify the entered text is displayed as-is (all lowercase)
        const fieldText = await nameField.getText();
        expect(fieldText).toBe('john smith');

        await attachScreenshot('Name Textbar - All lowercase "john smith" entered');

        // Clear for next test
        await nameField.clearValue();
    });

    it('TC002-9: Fill in with mixed letters, numbers, special symbols - Mixed input is displayed', async () => {
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.waitForDisplayed({ timeout: 10000 });

        // Tap field to focus, then type via keyboard
        await nameField.click();
        await browser.pause(300);
        await nameField.clearValue();
        await browser.pause(300);
        await nameField.addValue('John123@#$*');
        await browser.pause(500);

        // Hide keyboard to see the field clearly
        await browser.hideKeyboard();
        await browser.pause(300);

        // Verify the mixed input is displayed in the field
        const fieldText = await nameField.getText();
        expect(fieldText).toBe('John123@#$*');

        await attachScreenshot('Name Textbar - Mixed input "John123@#$*" entered');
    });

});

describe('General Store - Gender Radio Button', () => {
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

    it('TC002-10: Select Male from Gender Radio Button - Male is selected, Female deselected', async () => {
        const maleRadio = await $('id:com.androidsample.generalstore:id/radioMale');
        const femaleRadio = await $('id:com.androidsample.generalstore:id/radioFemale');
        await maleRadio.waitForDisplayed({ timeout: 10000 });

        // Select Male radio button
        await maleRadio.click();
        await browser.pause(500);

        // Verify Male is checked
        const maleChecked = await maleRadio.getAttribute('checked');
        expect(maleChecked).toBe('true');

        // Verify Female is not checked
        const femaleChecked = await femaleRadio.getAttribute('checked');
        expect(femaleChecked).toBe('false');

        await attachScreenshot('Gender Radio - Male selected, Female deselected');
    });

    it('TC002-11: Select Female from Gender Radio Button - Female is selected, Male deselected', async () => {
        const maleRadio = await $('id:com.androidsample.generalstore:id/radioMale');
        const femaleRadio = await $('id:com.androidsample.generalstore:id/radioFemale');
        await femaleRadio.waitForDisplayed({ timeout: 10000 });

        // Select Female radio button
        await femaleRadio.click();
        await browser.pause(500);

        // Verify Female is checked
        const femaleChecked = await femaleRadio.getAttribute('checked');
        expect(femaleChecked).toBe('true');

        // Verify Male is not checked
        const maleChecked = await maleRadio.getAttribute('checked');
        expect(maleChecked).toBe('false');

        await attachScreenshot('Gender Radio - Female selected, Male deselected');
    });
});

describe('General Store - Let\'s Shop Navigation', () => {
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

    it('TC002-12: On Male Gender, select Let\'s Shop - User navigated to Products Screen', async () => {
        // Ensure Male radio is selected
        const maleRadio = await $('id:com.androidsample.generalstore:id/radioMale');
        await maleRadio.waitForDisplayed({ timeout: 10000 });
        await maleRadio.click();
        await browser.pause(300);

        // Fill in name field (required for navigation)
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.click();
        await browser.pause(200);
        await nameField.clearValue();
        await nameField.addValue('John');
        await browser.hideKeyboard();
        await browser.pause(300);

        // Tap "Let's Shop" button
        const letsShopBtn = await $('id:com.androidsample.generalstore:id/btnLetsShop');
        await letsShopBtn.click();
        await browser.pause(2000);

        // Verify navigation to Products Screen
        const currentActivity = await browser.getCurrentActivity();
        expect(currentActivity).not.toContain('MainActivity');

        await attachScreenshot('Products Screen - Navigated with Male gender');
    });

    it('TC002-13: Go back to previous screen using back button - User returns to landing screen', async () => {
        // Press device back button
        await browser.back();
        await browser.pause(1000);

        // Verify we're back on the landing/main screen
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.waitForDisplayed({ timeout: 10000 });
        expect(await nameField.isDisplayed()).toBe(true);

        await attachScreenshot('Landing Screen - Returned via back button');
    });

    it('TC2-14: On Female Gender, select Let\'s Shop - User navigated to Products Screen', async () => {
        // Select Female radio button
        const femaleRadio = await $('id:com.androidsample.generalstore:id/radioFemale');
        await femaleRadio.waitForDisplayed({ timeout: 10000 });
        await femaleRadio.click();
        await browser.pause(300);

        // Fill in name field (required for navigation)
        const nameField = await $('id:com.androidsample.generalstore:id/nameField');
        await nameField.click();
        await browser.pause(200);
        await nameField.clearValue();
        await nameField.addValue('Jane');
        await browser.hideKeyboard();
        await browser.pause(300);

        // Tap "Let's Shop" button
        const letsShopBtn = await $('id:com.androidsample.generalstore:id/btnLetsShop');
        await letsShopBtn.click();
        await browser.pause(2000);

        // Verify navigation to Products Screen
        const currentActivity = await browser.getCurrentActivity();
        expect(currentActivity).not.toContain('MainActivity');

        await attachScreenshot('Products Screen - Navigated with Female gender');
    });
});
