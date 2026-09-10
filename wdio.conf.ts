import type { Options } from '@wdio/types';

export const config: Options.Testrunner = {
    runner: 'local',
    autoCompileOpts: {
        tsNodeOpts: {
            project: './tsconfig.json',
        },
    },
    specs: ['./tests/wdio/**/*.spec.ts'],
    exclude: [],
    maxInstances: 1,
    capabilities: [
        {
            platformName: 'Android',
            'appium:deviceName': 'emulator-5554',
            'appium:automationName': 'UiAutomator2',
            'appium:app': '/Users/ziyadkhalis/Downloads/General-Store.apk',
            'appium:appPackage': 'com.androidsample.generalstore',
            'appium:appActivity': '.SplashActivity',
            'appium:appWaitActivity': '.MainActivity',
            'appium:noReset': true,
            'appium:fullReset': false,
        },
    ],
    logLevel: 'info',
    bail: 0,
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    services: ['appium'],
    framework: 'mocha',
    reporters: [
        'spec',
        ['allure', {
            outputDir: 'allure-results',
            disableWebdriverStepsReporting: false,
            disableWebdriverScreenshotsReporting: false,
        }],
    ],
    mochaOpts: {
        ui: 'bdd',
        // Cart journeys walk the whole product list several times over, so they
        // need considerably more headroom than a single-screen check
        timeout: 300000,
    },
};
