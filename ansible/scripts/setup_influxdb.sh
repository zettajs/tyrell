#!/bin/bash

set -e
set -x

db=""
rf=4
split=2
shard_duration="7d"

# get influxdb host from etcd
host=$(basename $(etcdctl ls /services/influxdb/seed | head -n 1)):8086

while getopts r:s:d: opt; do
  case $opt in
  r)
      rf=$OPTARG
      ;;
  s)
      split=$OPTARG
      ;;
  d)
      shard_duration=$OPTARG
      ;;
  esac
done
shift $((OPTIND - 1))

if [ $# -lt 1 ]; then
  echo "Usage: <database name> [-r replication factor (4)] [-s shard split (2)] [-d shard duration (7d)]"
  exit 1;
fi;

db=$1

function generate_password()
{
    echo $(openssl rand -hex 24);
}

function generate_user()
{
    echo $(openssl rand -hex 16)
}

# create db
curl --fail -X POST 'http://'${host}'/cluster/database_configs/'$db'?u=root&p=root' -d '{"spaces":[{"name":"default","regEx":"/.*/","retentionPolicy":"inf","shardDuration":"'${shardDuration}'","replicationFactor":'$rf',"split":'$split',"$$hashKey":"00F"}]}'

# create db user
user=$(generate_user)
userpass=$(generate_password)
curl --fail -X POST 'http://'${host}'/db/'$db'/users?u=root&p=root' -d "{\"name\": \"${user}\", \"password\": \"${userpass}\"}"

# update root password
rootpass=$(generate_password)
curl --fail -X POST 'http://'${host}'/cluster_admins/root?u=root&p=root' -d "{\"password\": \"${rootpass}\"}"

# Update etcd for influx info
etcdctl set /services/influxdb/user $user
etcdctl set /services/influxdb/password $userpass
etcdctl set /services/influxdb/db $db

# Save the root pass somewhere
etcdctl set /services/influxdb/rootpass $rootpass

