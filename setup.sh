#!/bin/sh

ansible -i inventory/inventory all -m setup
