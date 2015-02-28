# Stack Deploy Utility for Zetta Cloud

Want to create a Zetta deployment with Latest CoreOS? Here's how.

## Vagrant

### Steps

1. Generate CoreOS box with Packer
  - `./generate_box.sh vagrant`
2. Start Stack
  - `./start_stack.sh`

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
## Other GOTCHAS!

- `/etc/machine-id` helps detect unique machines in the cluster. If for any reason this isn't destroyed before trying to peer with the discovery service then we will only have one machine in the cluster peered. This is taken care of in packer.
- `coreos-cloudinit` will run cloud-configs against the machine. This should be run in our local environment, but CloudFormation bootstrapping takes care of this for us.


## Config Updates

If you run into issues with using Ansible to provision on the cluster ensure that your SSH configuration and your Ansible configuration are present and up to date with your machine variables.

[Configuration Update Gist](https://gist.github.com/mdobson/8c16e6b497de8348b718)

## Configuring fleet to pull from private docker repositories

A .dockercfg file is required to run on all machines to authenticate with the docker private repo service.

Steps for getting a valid .dockercfg. This assumes you have boot2docker

1. `boot2docker init && boot2docker up`
2. `docker login`
3. Your .dockercg can be found at ~/.dockercfg
4. Copy the .dockercfg to every coreos machine with the ansible/deploy-config.yml playbook

## Running zetta-multi-cloud

To run zetta multi cloud via fleet services here are is what should be done for now.

**NOTE**: This assumes you have configured fleet to pull from our private container repositories.

```bash
# Submit the three services to fleet
fleetctl submit zetta-regsitry@.service zetta-proxy@.service zetta-target@.service

# Start a service registry for every machine in the cluster. Wait for registries to be pulled.
fleetctl start zetta-regsitry@{1..n}.service

# Start target servers.
fleetctl start zetta-target@{3001..3010}.service

# Start any number of proxies. I usually do three.
fleetctl start zetta-proxy@{1..3}.service
```
