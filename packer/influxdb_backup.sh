#!/usr/bin/env bash

# exit if any commands fail
set -e

# needed for COREOS_PRIVATE_IPV4
source /etc/environment
source /etc/profile.d/zetta

BACKUP_FOLDER=/tmp/backup/influxdb
DB=telegraf
BACKUP_PREFIX=influxdb
NOW=`/usr/bin/date "+%Y-%m-%d-%H%M"`

YESTERDAY=`/usr/bin/date --date="1 day ago" "+%Y-%m-%dT00:00:00Z"`
TODAY=`/usr/bin/date "+%Y-%m-%d"`

mkdir -p $BACKUP_FOLDER

# backup
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER influxdb influxd backup -database $DB -retention default -since $YESTERDAY -host $COREOS_PRIVATE_IPV4:8088 $BACKUP_FOLDER/$DB/$TODAY

# upload to s3
tar cfzv $BACKUP_FOLDER/backup-$DB-$NOW.tar.gz $BACKUP_FOLDER/$DB/$TODAY
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER cgswong/aws:s3cmd put $BACKUP_FOLDER/backup-$DB-$NOW.tar.gz s3://$METRICS_BACKUP_S3_BUCKET/$HOSTNAME/$BACKUP_PREFIX/

# cleanup
rm $BACKUP_FOLDER/backup-$DB-$NOW.tar.gz
rm -R $BACKUP_FOLDER/$TODAY
