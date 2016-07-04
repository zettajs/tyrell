#!/usr/bin/env bash

# exit if any commands fail
set -e

# needed for COREOS_PRIVATE_IPV4
source /etc/environment

BACKUP_FOLDER=/tmp/backup/grafana
METRICS_BACKUP_S3_BUCKET=link-metrics-backup
BACKUP_PREFIX=grafana

TODAY=`/usr/bin/date "+%Y-%m-%d"`

# upload to s3
mkdir -p $BACKUP_FOLDER
tar cfzv $BACKUP_FOLDER/backup-$TODAY.tar.gz /var/lib/grafana/grafana.db
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER cgswong/aws:s3cmd put $BACKUP_FOLDER/backup-$TODAY.tar.gz s3://$METRICS_BACKUP_S3_BUCKET/$BACKUP_PREFIX/

# cleanup
rm $BACKUP_FOLDER/backup-$TODAY.tar.gz
