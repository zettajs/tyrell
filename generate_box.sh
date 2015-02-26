#!/bin/bash

BOX_ENV=$1

if [ $BOX_ENV = "vagrant" ] 
  then 
    echo "Generating vagrant box."
    if [ -a ./packer_virtualbox-iso_virtualbox.box ] 
      then
        echo "Box detected cleaning up current box..."

        rm ./packer_virtualbox-iso_virtualbox.box
        vagrant box remove zetta-coreos-alpha --box-version 0
    fi

    echo "Starting build process for vagrant only."
    COREOS_MD5=`curl http://alpha.release.core-os.net/amd64-usr/current/coreos_production_iso.DIGESTS | grep -A 1 MD5 | grep coreos_production_iso_image.iso | awk '{ print $1 }'`
    cat packer/packer_template.json | sed -e "s/@@COREOS_MD5_HASH@@/${COREOS_MD5}/" > packer/packer.json
    packer build -only=virtualbox-iso packer/packer.json

    vagrant box add zetta-coreos-alpha packer_virtualbox-iso_virtualbox.box

elif [ $BOX_ENV = "aws" ]
  then
    echo "Building and deploying to AWS."

    echo "Starting build process for AWS only."

    packer build -only=amazon-ebs packer/packer.json


elif [ $BOX_ENV = "help" ]
  then
    echo "Utility for building and managing zetta infrastructure."
    
     
elif [ $BOX_ENV = "destroy" ]
  then
    vagrant destroy
    rm ./packer_virtualbox-iso_virtualbox.box
    vagrant box remove coreos-alpha --box-version 0
fi
