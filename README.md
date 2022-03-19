# Snowplow Schema Registry

Snowplow schemas.

Check-out [iglu-central](https://github.com/snowplow/iglu-central/tree/master/schemas) for a list of all available schemas.

## CI Workflow

There are two active branches

1. `develop`
2. `main`

Expected workflow (and subsequently, `.github/workflows`) is:

- Add schema and test(s) as required
- Test locally against Snowplow Micro (`./micro/run.sh`)
- Once happy, commit and create a PR bound for `develop`
- The PR branch will have workflows `lint` and `test` run against it
- Once validation workflows are passed, merge into `develop`
- The PR merge will trigger the workflows `lint`, `test`, `validate` and `publish` (with patch to DEV)
- Validate as needed in Snowplow Mini (DEV)
- Create a release PR when ready bound for `main`
- The PR branch will have workflows `lint` and `test` run against it
- Once ready, merge the release PR into `main`
- The PR merge will trigger the `publish` workflow which will promote all validated schemas from DEV to PROD

### Snowplow Schema Promotion

Using the [Snowplow API](https://console.snowplowanalytics.com/api/msc/v1/docs/#/) for managing our data structures results in the following workflow semantics.

- Test locally using Snowplow Micro (this is also what the tests themselves are run against)
- Create a [validation request](https://console.snowplowanalytics.com/api/msc/v1/docs/#/Data%20Structures/postOrganizationsOrganizationidData-structuresV1Validation-requests) which will place the schema in a virtual environment named `VALIDATED`
- Any future requests to the [deployment request API](https://console.snowplowanalytics.com/api/msc/v1/docs/#/Data%20Structures/postOrganizationsOrganizationidData-structuresV1Deployment-requests) will promote the schema from `VALIDATED` to the destination environment (`DEV` or `PROD`, which align to our Mini and Production instances respectively).

## Hacking

```sh
# Clone the repo
git clone git@github.com:joshes/snowplow-schema-registry.git
cd snopwlow-schema-registry

# Install dependencies
npm install

# Start-up snowplow micro
# Note this will block by default, so do this in another terminal - CTRL+C to quit
./micro/run.sh

# Run tests 
npm run test

# Or with optional debug logging
npm run test -- --debug
```
