#!/usr/bin/env bash

# exit if any commands fail
set -e

# needed for COREOS_PRIVATE_IPV4
source /etc/environment
source /etc/profile.d/zetta

BACKUP_FOLDER=/tmp/backup/grafana
BACKUP_PREFIX=grafana

NOW=`/usr/bin/date "+%Y-%m-%d-%H%M"`

# upload to s3
mkdir -p $BACKUP_FOLDER
tar cfzv $BACKUP_FOLDER/backup-$NOW.tar.gz /var/lib/grafana/grafana.db
docker run --rm -v $BACKUP_FOLDER:$BACKUP_FOLDER cgswong/aws:s3cmd put $BACKUP_FOLDER/backup-$NOW.tar.gz s3://$METRICS_BACKUP_S3_BUCKET/$HOSTNAME/$BACKUP_PREFIX/

# cleanup
rm $BACKUP_FOLDER/backup-$NOW.tar.gz
