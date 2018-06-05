#!/bin/bash -eu
#
# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

#!/usr/bin/env bash

# exit if any commands fail
set -e

# needed for COREOS_PRIVATE_IPV4
source /etc/environment
source /etc/profile.d/zetta

BACKUP_FOLDER=/tmp/backup/influxdb
BACKUP_PREFIX=influxdb
NOW=`/usr/bin/date "+%Y-%m-%d-%H%M"`

mkdir -p $BACKUP_FOLDER

docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER influxdb influxd backup -host $COREOS_PRIVATE_IPV4:8088 $BACKUP_FOLDER/$NOW/meta

# backup telegraf databae
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER influxdb influxd backup -database telegraf -retention default -host $COREOS_PRIVATE_IPV4:8088 $BACKUP_FOLDER/$NOW/data

# upload to s3
tar cfzv $BACKUP_FOLDER/backup-$NOW.tar.gz -C $BACKUP_FOLDER/$NOW .
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER cgswong/aws:s3cmd put $BACKUP_FOLDER/backup-$NOW.tar.gz s3://$METRICS_BACKUP_S3_BUCKET/$HOSTNAME/$BACKUP_PREFIX/

# cleanup
rm $BACKUP_FOLDER/backup-$NOW.tar.gz
rm -R $BACKUP_FOLDER/$NOW
