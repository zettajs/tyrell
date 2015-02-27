#!/bin/sh

DISCOVERY_URL=`curl http://discovery.etcd.io/new`

echo "Creating template with discovery url: $DISCOVERY_URL"

cat user-data.template | sed -e "s,@@ETCD_DISCOVERY_URL@@,${DISCOVERY_URL}," > user-data

vagrant up

./setup.sh && ./fleet.sh
