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
node cli builds create -v  --router-tag v0.6.1 --target-tag v0.6.0 --ami-type hvm --core-os-version 1010.6.0 aws
```

**Get Builds**

```
node cli builds
```

#### Create Metrics AMI

Has services for operational metrics. Influxdb, Grafana, ElasticSearch. Creates a Packer config from `packer/packer_metrics_service.json`. Modifies parameters during build process.

```
node cli builds create -v --metrics --ami-type hvm aws
NOTE: Record the AMI for further commands.
```

#### Create Data Worker AMI

AMI that has the data-worker application to process device/usage data from SQS and write to s3.
Creates a Packer config from `packer/packer_data_worker.json`. Modifies parameters during build process.

```
node cli builds create -v --worker --ami-type hvm aws
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

### Create Stack

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
node cli traffic tenant-mgmt-api $STACK_NAME --version <tenant-mgmt-id-returned> --zone <zone in router53 (with ending ".")>
```

### Routing Traffic to Stack

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
