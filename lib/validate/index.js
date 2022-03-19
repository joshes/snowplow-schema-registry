const fs = require('fs');
const path = require('path');
const fetch = require('cross-fetch').fetch;
const {
  program
} = require('commander');
const {
  parseIgluLayout,
  fetchAccessToken,
} = require('../utils');
const {
  fstat
} = require('fs');

const defaultSchemasRoot = path.resolve(path.dirname(__filename), '../../src/main');

program.name('validate-schemas');
program.version('1.0.0', '-v, --version', 'Validates the schemas');
program.option('--debug', 'Enable debug logging');
program.option('--schemas <schemas>', 'Schemas directory', defaultSchemasRoot);
program.requiredOption('--orgId <orgId>', 'Organization id');
program.requiredOption('--apiKey <apiKey>', 'API Key');
program.parse(process.argv);

const opts = program.opts();

if (opts.debug) {
  console.log(opts);
}

const error = (msg) => {
  console.error(msg);
}

const print = (msg) => {
  console.log(msg);
}

const debug = (msg) => {
  if (opts.debug) {
    console.debug('[DEBUG]', msg);
  }
}

const createValidationRequest = (self) => {
  return {
    "meta": {
      "hidden": false,
      "schemaType": self.type,
      "customData": {}
    },
    "data": JSON.parse(fs.readFileSync(self.path, {
      encoding: 'utf-8'
    })),
  };
};

/**
 * Entrypoint
 */
(async () => {
  try {
    const schemas = parseIgluLayout(opts.schemas);
    debug(`Schemas: ${JSON.stringify(schemas)}`);
    const accessToken = await fetchAccessToken(opts.apiKey, opts.orgId);
    const result = await schemas.reduce(async (totalErrors, self) => {
      const body = JSON.stringify(createValidationRequest(self));
      debug(`[POSTING] - self: ${JSON.stringify(self)} - body: ${body}`);
      const res = await fetch(`https://console.snowplowanalytics.com/api/msc/v1/organizations/${opts.orgId}/data-structures/v1/validation-requests`, {
        method: 'post',
        body,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      });
      let err = 0;
      debug(`Res status: ${res.status}`);
      if (res.status !== 200) {
        err++;
        error(`[ERROR] ${await res.text()}`);
      } else {
        const body = await res.json();
        if (!body.success || body.errors !== null || body.warnings !== null || !body.completed) {
          err++;
          error(`[ERROR] ${self.path} - ${JSON.stringify(body)}`);
        } else {
          print(`[OK] ${self.path} - ${JSON.stringify(body)}`);
        }
      }
      return (await totalErrors) + err;
    }, 0);
    debug(`Result: ${result}`);
    process.exit(result);
  } catch (err) {
    error(err.stack);
    process.exit(1);
  }
})();