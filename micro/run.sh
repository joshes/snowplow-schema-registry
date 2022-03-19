#!/usr/bin/env bash

## Run a local snowplow-micro instance with schemas auto-registered for local validation.

PWD=$(realpath "$(dirname "$0")")
SCHEMAS_ROOT=$(realpath "$(dirname "$0")/../src/main")

PORT=9090
VERSION=1.2.1

docker run \
  -p $PORT:9090  \
  -v $SCHEMAS_ROOT:/config/iglu-client-embedded/schemas \
  -v $PWD/config/iglu.json:/config/iglu.json \
  -v $PWD/config/micro.conf:/config/micro.conf \
  snowplow/snowplow-micro:$VERSION \
    --collector-config /config/micro.conf \
    --iglu /config/iglu.json