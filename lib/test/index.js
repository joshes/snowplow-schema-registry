const fs = require('fs');
const path = require('path');
const glob = require("glob");
const fetch = require('cross-fetch').fetch;
const snowplow = require('@snowplow/node-tracker');
const tough = require('tough-cookie');
const {
    program
} = require('commander');
const {
    parseIgluLayout,
    selfToPath,
} = require('../utils');

const defaultSchemasRoot = path.resolve(path.dirname(__filename), '../../src/main');
const defaultSchemaTestsRoot = path.resolve(path.dirname(__filename), '../../src/test');

program.name('test-schemas');
program.version('1.0.0', '-v, --version', 'Output the current version');
program.option('--debug', 'Enable debug logging');
program.option('--tests <tests>', 'Schema tests directory', defaultSchemaTestsRoot);
program.option('--schemas <schemas>', 'Schemas directory', defaultSchemasRoot);
program.option('--collector <collector>', 'Collector endpoint for snowplow-micro', 'http://localhost:9090');
program.parse(process.argv);

const opts = program.opts();

if (opts.debug) {
    console.log(opts);
}

const collectorUrl = new URL(opts.collector);

const cookiejar = new tough.CookieJar();

if (![opts.schemas, opts.tests].every(fs.existsSync)) {
    console.error(`Not all paths exist - check your values and try again.`);
    console.error('Values found:');
    console.error(opts);
    process.exit(1);
}

const {
    gotEmitter,
    tracker
} = snowplow;

/**
 * Checks if the schema exists in the iglu server
 * @param {*} vendor 
 * @param {*} name 
 * @param {*} version 
 * @param {*} format 
 * @returns true if found, false otherwise
 */
const igluExists = async (vendor, name, version, format = 'jsonschema') => {
    const res = await fetch(`${opts.collector}/micro/iglu/${vendor}/${name}/${format}/${version}`);
    return res.status === 200;
}

let exitInError = false;

const error = (msg) => {
    console.error(msg);
    exitInError = true;
}

const print = (msg) => {
    console.log(msg);
}

const debug = (msg) => {
    if (opts.debug) {
        console.debug('[DEBUG]', msg);
    }
}

const initSnowplow = (responseHandler) => {
    const e = gotEmitter(
        collectorUrl.hostname,
        collectorUrl.protocol === 'http:' ? snowplow.HttpProtocol.HTTP : snowplow.HttpProtocol.HTTPS,
        parseInt(collectorUrl.port),
        snowplow.HttpMethod.POST,
        0, // buffer
        0, // retries
        cookiejar,
        responseHandler
    );
    return tracker([e], 'TestTracker', 'myApp', false);
}

const tests = parseIgluLayout(opts.tests);

const schemas = parseIgluLayout(opts.schemas);

/**
 * Entrypoint
 */
(async () => {
    try {

        // Check the schema exists in iglu
        await Promise.all(schemas.map(async (self) => {
            const exists = await igluExists(self.vendor, self.name, self.version, self.format);
            debug(`${JSON.stringify(self)} - exists: ${exists}`);
            if (!exists) {
                error(`[ERROR] ${selfToPath(self)} - does not exist in iglu`);
            }
        }));

        // Run common checks
        await Promise.all(schemas.map(async (self) => {
            const schema = JSON.parse(fs.readFileSync(self.path, {
                encoding: 'utf-8'
            }));
            // assert that the name aligns with its folder
            if (self.name !== schema.self.name || self.version !== schema.self.version) {
                error(`[ERROR] ${selfToPath(self)} - name or version mismatch between directory layout and self`);
            }
            // assert that all required properties are defined in the schema
            const required = schema.required;
            if (required && required.length) {
                const props = Object.keys(schema.properties);
                required.map(rp => {
                    if (!props.includes(rp)) {
                        error(`[ERROR] ${selfToPath(self)} - required property "${rp}" is not defined!`);
                    }
                });
            }

        }));

        // Run all tests in each test file
        for (self of tests) {
            await new Promise(async (resolveTest, rejectTest) => {
                const test = require(path.resolve(self.path));
                const id = selfToPath(self);
                for (name of Object.keys(test)) {
                    await new Promise((resolveCase, rejectCase) => {
                        const fun = test[name];
                        const requestTimeoutMillis = 3000;
                        let assertCalled, assertOk, handlerCalled, resultSuccess, timer;

                        const t = initSnowplow((err, res) => {
                            handlerCalled = true;
                            resultSuccess = true;
                            startTimerIfNotRunning();
                            if (err) {
                                error(err.stack);
                                resultSuccess = false;
                            } else {
                                resultSuccess = res.statusCode === 200;
                            }
                            check();
                        });

                        const startTimerIfNotRunning = () => {
                            if (timer) return;
                            timer = setTimeout(() => {
                                error(`[FAIL] "${name}" - Timed out after ${requestTimeoutMillis}ms.`);
                                clearTimeout(timer);
                                resolveCase();
                            }, requestTimeoutMillis)
                        }

                        const check = () => {
                            if (assertCalled && handlerCalled) {
                                const success = assertOk && resultSuccess || !assertOk && !resultSuccess;
                                if (!success) {
                                    error(`[FAIL] "${name}" - Assertion failed.`);
                                } else {
                                    print(`[PASS] "${name}"`);
                                }
                                clearTimeout(timer);
                                resolveCase();
                            }
                        };

                        const assertCall = (ok) => {
                            return () => {
                                startTimerIfNotRunning();
                                assertCalled = true;
                                assertOk = ok;
                                check();
                            }
                        };

                        const assert = {
                            ok: assertCall(true),
                            fail: assertCall(false),
                        };

                        // Apply the test function
                        fun(t, snowplow, assert);
                    });
                }
                resolveTest();
            });
        };

        process.exit(exitInError ? 1 : 0);

    } catch (err) {
        error(err.stack);
        process.exit(1);
    }
})();