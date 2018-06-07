# Tyrell

Stack Deploy Utility for Zetta Cloud

![tyrell-logo](assets/tyrell.png)

Want to create a Zetta deployment with Latest CoreOS? Here's how!

## Getting Started AWS

### Build AMIs

First build the proper AMIs in AWS.

#### Build Service Image

Build Link application ami, has link-router, link-zetta-target, link-tenant-mgmt-api, etc...
Creates a Packer config from `packer/packer_template_base.json`. Modifies parameters during build process.

```
node cli builds create -v  --router-tag v0.6.1 --target-tag v0.6.0 --ami-type pv --core-os-version 1010.6.0 aws
```

**Get Builds**

```
node cli builds
```

#### Create Metrics AMI

Has services for operational metrics. Influxdb, Grafana, ElasticSearch. Creates a Packer config from `packer/packer_metrics_service.json`. Modifies parameters during build process.

```
node cli builds create -v --metrics --ami-type pv aws
```

#### Create Data Worker AMI

AMI that has the data-worker application to process device/usage data from SQS and write to s3.
Creates a Packer config from `packer/packer_data_worker.json`. Modifies parameters during build process.

```
node cli builds create -v --worker --ami-type pv aws
```

**Get Builds**

```
node cli builds --worker
```

### Create the VPC

Create a VPC to associate a Link Stack to. Multiple link stacks can exist within a VPC.
Note: you may be limited by the number of VPCs in an AWS account. "The maximum number of VPCs has been reached."

```
node cli network create <name>
```

Once complete record the VPC id.

```
$ node cli network
Stack Name	VPC ID
test-vpc	vpc-233b5755

export VPC_ID=vpc-233b5755
```

### Create Metrics Service

Before creating any Link stacks you need to ensure you have a metrics instance that contains InfluxDB. To 
allow the stacks to write to the service.

TODO currently build is failing to start influxdb and other services.

### Create Stack

A stack creates a CloudFormation stack which contains all the security groups, ELBs, S3 buckets, etc... for the Link stack to function. 
Doesn't deploy any components though they are created in separate CloudFormation Stacks. Stack is later referenced during component bring up
to use the same configuration variables.

```
export STACK_NAME=test-stack
node cli stacks create -v $VPC_ID --no-provision --ami-type hvm --core-os-version 1010.6.0 -t t2.large $STACK_NAME
```

### Create Link Routers

Link routers provide a multi-tenanted Zetta API infront if N number of Zetta targets. This is exposed as the "Zetta API" to Link. Tenants are separated by
the HTTP header `x-apigee-iot-tenant-id` defaults to `default` tenant.

Service files: `roles/router`

```
node cli routers create  -v $VPC_ID -a <ami-XXXXXX> --type t2.medium -s 2 $STACK_NAME

# Route traffic to this version of the routers.
node cli traffic elb $STACK_NAME --router <router-id-returned>
```

### Create Zetta Targets

Zetta targets are Zetta servers with a few modules installed to collect device data
and usage data and writes it to SQS. By default it runs 10 zetta instances per host.

Service files: `roles/target`

```
node cli targets create -v $VPC_ID -a <ami-XXXXXX> --type t2.large -s 2 $STACK_NAME

# Route traffic to this version of the zetta targets. Note: needs ssh key from stack create. 
node cli traffic zetta $STACK_NAME -k zetta-kp-$STACK_NAME.pem --target <router-id-returned>
```

### Create Tenant Management API

Tenant Management API provides an admin API for reading and modifying the current
tenants in the Link stack. Does not run an ASG currently.

Service files: `roles/tenant-mgmt-api`

```
node cli tenant-mgmt-api create -a <ami-XXXXXX> -v $VPC_ID --type t2.large $STACK_NAME

## Route traffic to DNS name. tenant-mgmt.<stack-name>.<zone>
node cli traffic tenant-mgmt-api $STACK_NAME --version e0bd1c76b5c7 --zone <zone in router53 (with ending ".")>
```

## Routing Traffic to Stack

Find the created Resource from the stacks CloudFormation stack, it's named the same as the Link stack. The ELB's 
resource name is `ZettaELB` in the CF stack. The UI provides a link to the actual ELB. Use that DNS name or create
a CNAME for linking zetta peers to the Link stack.

*Note: By default the stack is opened to the world. Lock down the Security Groups created to implement IP whitelisting.*

Public Security Groups:
 - `TenantMgmtSecurityGroup` - Tenant MGMT hosts. Exposes port 80 to 0.0.0.0 by default.
 - `ELBSecurityGroup` - Router ELB security group. Exposes port 80 to 0.0.0.0 by default.

## Dependencies

- Vagrant
- Packer  0.12.0
- CoresOS 1010.6.0
- Virtualbox
- Docker for Mac
- AWS API Credentials

## Disclaimer

This is not an officially supported Google product.
