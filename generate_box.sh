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
