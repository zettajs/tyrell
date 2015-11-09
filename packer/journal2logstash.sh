#!/usr/bin/env bash

token=${LOGENTRIES_TOKEN}

journalctl -o json -f | ncat metrics.iot.apigee.net 8081
