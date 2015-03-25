#!/usr/bin/env bash

token=${LOGENTRIES_TOKEN}

journalctl -o short -f | awk -v token=$token '{ print token, $0; fflush(); }' | ncat --ssl --ssl-verify data.logentries.com 20000
