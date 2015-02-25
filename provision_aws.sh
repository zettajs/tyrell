#!/bin/sh

HOST_IP=`./aws/ec2.py | json tag_Stack_Zetta_Core[0]`

cat <<EOF > .inventory
## Basic ansible inventory
core-01 ansible_ssh_host=$HOST_IP

[zetta]
core-01

[coreos]
core-01

[coreos:vars]
ansible_python_interpreter="PATH=/home/core/bin:\$PATH python"
EOF

ansible -i .inventory all -m setup --private-key=mdobs2-coreos-testing.pem
ansible-playbook -i .inventory ansible/fleet.yml --private-key=mdobs2-coreos-testing.pem
