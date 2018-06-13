# Tyrell

Stack Deploy Utility for Zetta Link Cloud

![tyrell-logo](assets/tyrell.png)

## What is Link

Link provides a highly available and multi-tenanted version of [Zetta](https://github.com/zettjs/zetta).

### Main Components of Link

 - [Link Router](https://github.com/zettajs/link-router) - A proxy that sits in front of N-number of Zetta instances to provide a highly available version of Zetta. And provides 
 multiple tenants that exist within the Zetta API controlled through the `x-apigee-iot-tenant` header. API that it implements is a standard
 Zetta API. Is responsible for allocating and assigning Zetta targets to tenants. Routers read and write data to a etcd cluster to get a list
 of Zetta targets and write peer information per tenant.
 - [Link Zetta Target](https://github.com/zettajs/link-zetta-target) - A Zetta instance configured with a few plugins to write device data and usage to AWS SQS. As part of Link the startup scripts
 register each zetta target instance in etcd cluster under `/services/zetta/<ip:port>`. *N-Number of zetta targets can run per instance depending on instance size, defaults to 10 use t2.large*
 - [Link Tenant Management](https://github.com/zettajs/link-tenant-mgmt-api) - Management API to update/delete Link tenants. Can scale the number of Zetta instances allocated to a tenant. Provides a
 list of peers associated with the tenant.
 - [Link Metrics Collector](https://github.com/zettajs/link-metrics-collector) - Small program that runs and collects data from etcd2 cluster about the number of tenants, peeers, etc... and records
 them to InfluxDB through a Telegraf metric. *Note: Does not have it's own role but instead runs on the tenant management server*
 - [s3 Device Data Worker](https://github.com/zettajs/link-sqs-data-worker) - Simple program that reads device and usage data from AWS SQS and write S3 files. *Note: Tyrell does not use CoreOS for these
 boxes and schedules the ASG to scale up and down once on the hour to clear the queue*

 ### Future Components
 
 In the process of developing Link we created a few others components of Link that never made it to production.

 - [Link Usage API](https://github.com/zettajs/link-usage-api) - Provided a API that returned analytic data on zetta device data and usage data stored in InfluxDB.
 - [Internal/External MQTT Brokers](https://github.com/zettajs/link-device-to-cloud-poc) - Provided as part of our Device to Cloud POC that provided low powered devices to communicate
 over MQTT using a light weight Zetta protocol. Zetta targets were provisioned with MQTT scouts that generated Zetta device APIS
 for the devices allowing them to be controlled over HTTP.
 - [Credential API](https://github.com/zettajs/link-device-to-cloud-poc) - Provided as part of our Device to Cloud POC that provided low powered devices to communicate
 over MQTT using a light weight Zetta protocol. Credential API created and managed MQTT device credentials.

## What is Tyrell

Tyrell is a utility to deploy and manage Link stacks, a independent grouping of Link components, in AWS. Machines run 
[CoreOS](https://coreos.com/) however mainy of features of CoreOS have been disabled by default such as auto-updates, deploying components
with fleetctl, etc... So at it's core Link only needs a etcd2 cluster which CoreOS provides and all services are deployed as Docker containers
on the instances. Tyrell uses Packer to create an AMI that has all Docker containers of each individual components on saved. This can map 
to specific releases of the two main components routers and targets. The rest is deploying instances to AWS using Cloudformation and other
AWS services.

What is a Role? In the `roles/...` directory you will see a number of directories. A role maps to a component within the system and provides
details on how to create a version of that using a Cloudformation template and cloud-init file for both local vagrant and aws. The Cf template
specifies the AWS components needed like Security Groups, Autoscale groups, etc... The cloud-init files specifies what link services start and 
a way to pass in env variables where needed. 

Within the `roles/initial-stack-cf.json` that is the Cloudformation Stack that is created once per stack. It contains all the static resources
like Security groups, ELBs, SQS queues, s3 buckets, etc... that do not change between component updates. When Cf stacks are created per component
versions many parameters are referenced from this stack, tyrell will pull the Stack using the AWS API and use it's resources/parameters to pass
values to the component stacks.

### High Level Development Flow

1. Build Docker containers for component.
1. Build ami for stack using Packer and pulls all Docker containers in.
1. Deploy ASG of each component.
1. Blue-Green traffic routing for an active version of the component.


### Vagrant

Tyrell provides features to deploy a "cluster" locally using Vagrant as well. However with updates to Virtualbox support for this feature
is quite spotty. It also does not provide a one-to-one mapping as a AWS stack but does provide a core functionality.

```
# Build a vbox file using Packer
node cli builds create -v  --router-tag v0.6.1 --target-tag v0.6.0 --core-os-version 1010.6.0 vagrant
# Deploy Vagrant file. Generates the user-data files and runs `vagrant up` then sets the Zetta version in the etcd cluster in `/zetta/version`
node cli local start -n -v
```

## Getting Started AWS

Want to create a Zetta deployment with Latest CoreOS? Here's how!

First install the prerequisites:

### AWS CLI
```
# Install the AWS CLI
brew install awscli
aws configure
```

### Packer

[Packer 0.12.0](https://releases.hashicorp.com/packer/0.12.0)

### Install CLI

*Note: Use node.js 0.12.x*

```
git clone https://github.com/zettajs/tyrell.git
cd tyrell/cli
npm install
```

### Build AMIs

First build the proper AMIs in AWS.

#### 1. Build Service Image

Build Link application ami, has link-router, link-zetta-target, link-tenant-mgmt-api, etc...
Creates a Packer config from `packer/packer_template_base.json`. Modifies parameters during build process.

```
node cli builds create -v  --router-tag v0.6.1 --target-tag v0.6.0 --ami-type hvm --core-os-version 1010.6.0 aws
```

**Get Builds**

```
node cli builds
```

#### 2. Create Metrics AMI

Has services for operational metrics. Influxdb, Grafana, ElasticSearch. Creates a Packer config from `packer/packer_metrics_service.json`. Modifies parameters during build process.

```
node cli builds create -v --metrics --ami-type hvm aws
NOTE: Record the AMI for further commands.
```

#### 3. Create Data Worker AMI

AMI that has the data-worker application to process device/usage data from SQS and write to s3.
Creates a Packer config from `packer/packer_data_worker.json`. Modifies parameters during build process.

```
node cli builds create -v --worker --ami-type hvm aws
```

**Get Builds**

```
node cli builds --worker
```

### 4. Create the VPC

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

### 5. Create Metrics Service

Before creating any Link stacks you need to ensure you have a metrics instance that contains InfluxDB. To 
allow the stacks to write to the service. Metric Box runs:

- InfluxDB@0.13
- Grafana@3.1.0-beta1
- ElasticSeach@2.4
- Kibana@4.6.0

*Note: The default security group for the metrics stack is open to the world. You MUST lock down. Inbound to InfluxDB data :8086, ElasticSearch Logs :9200 from all Zetta CoreOsSercurityGroups in each stack.*

```
node cli-metrics-create.js --ami <ami-from-metrics-build> -v $VPC_ID --type t2.xlarge metrics-stack
```

**Fix First Start Issues**

1. SSH into box. After creating the metric stack a AWS keypair named. `metrics-kp-metrics-<stack-name>.pem`
1. `sudo systemctl restart grafana`
1. `sudo systemctl restart link-kibana`
1. Create a Admin user for InfluxDB. `influx -host <ip or dns of Metrics host>. > CREATE USER admin WITH PASSWORD '<password>' WITH ALL PRIVILEGES`
1. Log into Grafana. http://<ip or dns>:20000. Use `admin:admin` for default username and password. Please change this and create new users.
1. Go to Datasources, add the user name and password for the Admin influxdb user or create a new one for only Grafana. Click Save and Test.

You can use Route53 to create DNS name that points to the metrics boxes IP.

```
export METRICS_HOST=http://<ip or dns>:8086
export INFLUX_AUTH=admin:<password>
```

### 6. Create Stack

A stack creates a CloudFormation stack which contains all the security groups, ELBs, S3 buckets, etc... for the Link stack to function. 
Doesn't deploy any components though they are created in separate CloudFormation Stacks. Stack is later referenced during component bring up
to use the same configuration variables.

```
export STACK_NAME=test-stack
# With Metrics
node cli stacks create -v $VPC_ID --no-provision --ami-type hvm --core-os-version 1010.6.0 -t t2.large --influxdb-host $METRICS_HOST --influxdb-auth $INFLUX_AUTH  $STACK_NAME
# Without Metrics
node cli stacks create -v $VPC_ID --no-provision --ami-type hvm --core-os-version 1010.6.0 -t t2.large
```

### 7. Create Link Routers

Link routers provide a multi-tenanted Zetta API infront if N number of Zetta targets. This is exposed as the "Zetta API" to Link. Tenants are separated by
the HTTP header `x-apigee-iot-tenant-id` defaults to `default` tenant.

Service files: `roles/router`

```
node cli routers create  -v $VPC_ID -a <ami-XXXXXX> --type t2.medium -s 2 $STACK_NAME

# Route traffic to this version of the routers.
node cli traffic elb $STACK_NAME --router <router-id-returned>
```

### 8. Create Zetta Targets

Zetta targets are Zetta servers with a few modules installed to collect device data
and usage data and writes it to SQS. By default it runs 10 zetta instances per host.

Service files: `roles/target`

```
node cli targets create -v $VPC_ID -a <ami-XXXXXX> --type t2.large -s 2 $STACK_NAME

# Route traffic to this version of the zetta targets. Note: needs ssh key from stack create. 
node cli traffic zetta $STACK_NAME -k zetta-kp-$STACK_NAME.pem --target <router-id-returned>
```

### 9. Create Tenant Management API

Tenant Management API provides an admin API for reading and modifying the current
tenants in the Link stack. Does not run an ASG currently.

Service files: `roles/tenant-mgmt-api`

```
node cli tenant-mgmt-api create -a <ami-XXXXXX> -v $VPC_ID --type t2.large $STACK_NAME

## Route traffic to DNS name. tenant-mgmt.<stack-name>.<zone>
node cli traffic tenant-mgmt-api $STACK_NAME --version <tenant-mgmt-id-returned> --zone <zone in router53 (with ending ".")>
```

### 10. Routing Traffic to Stack

Find the created Resource from the stacks CloudFormation stack, it's named the same as the Link stack. The ELB's 
resource name is `ZettaELB` in the CF stack. The UI provides a link to the actual ELB. Use that DNS name or create
a CNAME for linking zetta peers to the Link stack.

*Note: By default the stack is opened to the world. Lock down the Security Groups created to implement IP whitelisting.*

Public Security Groups:
 - `TenantMgmtSecurityGroup` - Tenant MGMT hosts. Exposes port 80 to 0.0.0.0 by default.
 - `ELBSecurityGroup` - Router ELB security group. Exposes port 80 to 0.0.0.0 by default.

## Dependencies

- Vagrant
- [Packer 0.12.0](https://releases.hashicorp.com/packer/0.12.0)
- CoresOS 1010.6.0
- [Virtualbox](https://www.virtualbox.org/wiki/Downloads)
- Docker for Mac
- AWS API Credentials

## Disclaimer

This is not an officially supported Google product.
