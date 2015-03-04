# Stack Deploy Utility for Zetta Cloud

Want to create a Zetta deployment with Latest CoreOS? Here's how.

## Vagrant

### Steps

1. Generate CoreOS box with Packer
  - `./generate_box.sh vagrant`
2. Start Stack
  - `./start_stack.sh`

## AWS

## Dependencies

- Vagrant
- Packer
- AWS CLI Tools
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

## Configuring fleet to pull from private docker repositories

A .dockercfg file is required to run on all machines to authenticate with the docker private repo service.

Steps for getting a valid .dockercfg. This assumes you have boot2docker

1. `boot2docker init && boot2docker up`
2. `docker login`
3. Your .dockercg can be found at ~/.dockercfg
4. Copy the .dockercfg to every coreos machine with the ansible/deploy-config.yml playbook

For now you can use the .dockercfg found here. https://gist.github.com/mdobson/3560429303634f8c3a92


