#!/usr/bin/env bash

# exit if any commands fail
set -e

# needed for COREOS_PRIVATE_IPV4
source /etc/environment

BACKUP_FOLDER=/tmp/backup/influxdb
METRICS_BACKUP_S3_BUCKET=link-metrics-backup

YESTERDAY=`/usr/bin/date --date="1 day ago" "+%Y-%m-%dT00:00:00Z"`
TODAY=`/usr/bin/date "+%Y-%m-%d"`

# backup
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER influxdb influxd backup -database telegraf -retention default -host $COREOS_PRIVATE_IPV4:8088 -since $YESTERDAY $BACKUP_FOLDER/$TODAY

# upload to s3
tar cfzv $BACKUP_FOLDER/backup-$TODAY.tar.gz $BACKUP_FOLDER/$TODAY
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER cgswong/aws:s3cmd put $BACKUP_FOLDER/backup-$TODAY.tar.gz s3://$METRICS_BACKUP_S3_BUCKET/

# cleanup
rm $BACKUP_FOLDER/backup-$TODAY.tar.gz
rm -R $BACKUP_FOLDER/$TODAY
