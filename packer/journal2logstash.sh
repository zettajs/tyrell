#!/usr/bin/env bash

journalctl -o json -f | ncat localhost 8081
