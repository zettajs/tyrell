# Stack Deploy Utility for Zetta Cloud

Want to create a Zetta deployment with Latest CoreOS? Here's how.

## Vagrant

### Steps

1. Generate CoreOS box with Packer
  - `./generate_box.sh vagrant`
2. Get Discovery URL
  - `GET http://discovery.etcd.io/new`
3. Update Configuration
  - `Update discovery_url in user-data file`
4. Start Cluster
  - `vagrant up`
5. Ansible Provision
  - `./setup.sh && ./fleet.sh`

## AWS

1. Generate CoreOS box with Packer
  - `./generate_box.sh aws`
2. Get Discovery URL
  - `GET http://discovery.etcd.io/new`
3. Update Configuration
  - `Update discovery_url in aws-cluster.yml`
  - `Update AMI in cloud-formation.json`
4. Deploy via CloudFormation
  - `ansible-playbook aws-cluster.yml`
5. Ansible Provision
  - `TBD`

## Dependencies

- Vagrant
- Ansible
- Packer
- Boto `pip install boto`
- AWS API Credentials

## A note on AWS

You'll want to store your AWS credentials in an environment file. Like below. 

Boto is used by ansible to provision CloudFormation stacks, and boto looks for the two environment variables to access the AWS API.

```bash
export AWS_ACCESS_KEY_ID=""
export AWS_SECRET_ACCESS_KEY=""
```