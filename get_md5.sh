#!/bin/sh

COREOS_MD5=`curl http://alpha.release.core-os.net/amd64-usr/current/coreos_production_iso.DIGESTS | grep -A 1 MD5 | grep coreos_production_iso_image.iso | awk '{ print $1 }'`

cat packer/packer_template.json | sed -e "s/@@COREOS_MD5_HASH@@/${COREOS_MD5}/" > packer/packer.json
