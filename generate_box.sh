#!/bin/bash

BOX_ENV=$1

if [ -a $HOME/.dockercfg ]
  then
    cp $HOME/.dockercfg packer/.dockercfg
else
  then
    echo "Error copying dockercfg over. Login to the registry service and try again."
    exit
fi

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
    
    cat packer/packer_template.json | sed -e "s/@@AWS_ACCESS_KEY@@/${AWS_ACCESS_KEY}/" | sed -e "s/@@AWS_SECRET_KEY@@/${AWS_SECRET_KEY}/" > packer/packer.json

    packer build -only=amazon-ebs packer/packer.json


elif [ $BOX_ENV = "--help" ]
  then
    echo "Utility for building and managing zetta infrastructure."
    echo "Usage: ./generate_box.sh <platform>"
    echo "platforms:"
    echo "vagrant -> Generates a vagrant box from the latest CoreOS iso."
    echo "aws -> Generates an AWS image from the latest AMI available." 
     
elif [ $BOX_ENV = "destroy" ]
  then
    vagrant destroy
    rm ./packer_virtualbox-iso_virtualbox.box
    vagrant box remove coreos-alpha --box-version 0
fi
