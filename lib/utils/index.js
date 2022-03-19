const glob = require("glob");
const fetch = require('cross-fetch').fetch;
const path = require('path');

/**
 * Given a conventionally laid out iglu directory, parse it and 
 * return list of objects corresponding to the "self" definition in a iglu schema
 * e.g. {
 *   vendor: 'org.mycorp',
 *   name: 'myevent',
 *   format: 'jsonschema',
 *   version: '1-0-0',
 *   type: event | entity
 * }
 * This doubles up for usage in finding *.js tests as well, and the extension will be omitted 
 * and returned normalized as if it was not a js file.
 * 
 * @param {*} dir 
 * @returns 
 */
 const parseIgluLayout = (dir) => {
  return glob
      .sync(`${dir}/**/jsonschema/?-?-?*(.js)`)
      .map(p => p.replace(path.join(dir, path.sep), ''))
      .map(p => p.replace(/\.js$/i, ''))
      .map(s => {
          let self = {};
          [self.vendor, self.name, self.format, self.version] = s.split(path.sep);
          self.type = typeOfSchema(self);
          self.path = path.join(dir, s);
          return self;
      });
};

/**
* Take a "self" and convert it to an iglu path
* @param {*} s 
* @returns 
*/
const selfToPath = s => `${s.vendor}/${s.name}/${s.format}/${s.version}`;

// This is specific to "us" as we group our schemas by type in the vendor 
// e.g., com.mycorp.<type>
const typeOfSchema = self => {
  const type = self.vendor.split('.').pop();
  switch (type) {
      case 'entities':
      case 'entity':
          return 'entity';
      case 'events':
      case 'event':
          return 'event';
  }
  throw new Error(`Unhandled event type - ${type}`);
}

/**
 * Get an access token for the given orgId
 * @param {*} apiKey 
 * @param {*} orgId 
 * @returns 
 */
const fetchAccessToken = async (apiKey, orgId) => {
  const res = await fetch(`https://console.snowplowanalytics.com/api/msc/v1/organizations/${orgId}/credentials/v2/token`, {
    headers: {
      'X-API-Key': apiKey
    }
  });
  if (res.status !== 200) throw new Error('Failed to get access token');
  const body = await res.json();
  return body.accessToken;
}

module.exports = {
  fetchAccessToken,
  parseIgluLayout,
  selfToPath,
  typeOfSchema,
}