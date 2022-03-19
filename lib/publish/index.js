const path = require('path');
const crypto = require('crypto');
const fetch = require('cross-fetch').fetch;
const {
  program
} = require('commander');
const {
  parseIgluLayout,
  fetchAccessToken,
} = require('../utils');

const defaultSchemasRoot = path.resolve(path.dirname(__filename), '../../src/main');

program.name('publish-schemas');
program.version('1.0.0', '-v, --version', 'Publishes validated schemas.');
program.option('--debug', 'Enable debug logging');
program.option('--schemas <schemas>', 'Schemas directory', defaultSchemasRoot);
program.requiredOption('--target <target>', 'Target environment (DEV or PROD)', 'DEV');
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

const createPublishRequest = (self, target) => {
  return {
    "message": "",
    // Promote VALIDATED -> DEV -> PROD
    "source": target === 'DEV' ? 'VALIDATED' : 'DEV',
    "target": target,
    "vendor": self.vendor,
    "name": self.name,
    "format": self.format,
    "version": self.version,
  };
};

const schemaHash = (orgId, self) => {
  return crypto.createHash('sha256')
    .update(`${orgId}-${self.vendor}-${self.name}-${self.format}`)
    .digest('hex');
}

const publish = async (accessToken, orgId, patch, body) => {
  debug(`Publishing ${body} - patch: ${patch}}`);
  return fetch(`https://console.snowplowanalytics.com/api/msc/v1/organizations/${orgId}/data-structures/v1/deployment-requests?patch=${patch}`, {
    method: 'post',
    body,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
  });
}

const schemaExists = async (accessToken, orgId, self, target) => {
  const hash = schemaHash(orgId, self);
  debug(`Schema hash for ${JSON.stringify(self)} is ${hash}`);
  const res = await fetch(`https://console.snowplowanalytics.com/api/msc/v1/organizations/${orgId}/data-structures/v1/${hash}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  debug(`Schema exist request status: ${res.status}`);
  if (res.status !== 200) {
    return false;
  }
  const body = await res.json();
  return body.deployments.find(d => d.env === target);
}

/**
 * Entrypoint
 */
(async () => {
  try {
    const schemas = parseIgluLayout(opts.schemas);
    debug(`Schemas: ${JSON.stringify(schemas)}`);
    const accessToken = await fetchAccessToken(opts.apiKey, opts.orgId);
    const result = await schemas.reduce(async (totalErrors, self) => {
      const body = JSON.stringify(createPublishRequest(self, opts.target));
      print(`Publishing - ${body}`);

      const exists = await schemaExists(accessToken, opts.orgId, self, opts.target);

      let patch = false;

      if (exists) {
        if (opts.target === 'PROD') {
          print(`[INFO] Schema already exists in PROD - no update to be performed for ${JSON.stringify(self)}`);
          return totalErrors;
        } else {
          // Always PATCH in DEV, but only when it already exists
          patch = true; 
        }
      }

      const res = await publish(accessToken, opts.orgId, patch, body);

      let err = 0;
      debug(`Res status: ${res.status}`);
      if (![200, 201].includes(res.status)) {
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