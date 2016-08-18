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
# backup linkusage databae
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER influxdb influxd backup -database linkusage -retention default -host $COREOS_PRIVATE_IPV4:8088 $BACKUP_FOLDER/$NOW/data

# upload to s3
tar cfzv $BACKUP_FOLDER/backup-$NOW.tar.gz -C $BACKUP_FOLDER/$NOW .
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER cgswong/aws:s3cmd put $BACKUP_FOLDER/backup-$NOW.tar.gz s3://$METRICS_BACKUP_S3_BUCKET/$HOSTNAME/$BACKUP_PREFIX/

# cleanup
rm $BACKUP_FOLDER/backup-$NOW.tar.gz
rm -R $BACKUP_FOLDER/$NOW
