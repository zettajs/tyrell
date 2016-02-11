# Deployment CLI


```
  Usage: cli [options] [command]


  Commands:

    stacks                 list all stacks, and sub commands
    targets [stack-name]   list targets and sub commands
    routers [stack-name]   list routers and sub commands
    traffic [stack-name]   switch elb traffic to a specific router ASG
    builds                 build a new CoreOS image for zetta.
    local                  interact with a local CoreOS cluster.
    help [cmd]             display help for [cmd]

  Options:

    -h, --help  output usage information
```


## Configuring

Create a credentials file at ~/.aws/credentials on Mac/Linux or C:\Users\USERNAME\.aws\credentials on Windows

```
[default]
aws_access_key_id = your_access_key
aws_secret_access_key = your_secret_key

```

## Deploy Project Example

```bash

# Provisions routers/targets/workers with the latest amis
node cli stacks create example

# Or manually
node cli stacks create example --no-provision

node cli builds
node cli routers create example -a ami-123456
node cli targets create example -a ami-123456

node cli traffic elb example --router <router-version>
node cli traffic zetta example --version <zetta-version> -k zetta-kp-example.pem

node cli builds --workers
node cli workers create example -a ami-654321

```



## Stacks

Stacks would refer to example "Centralite", these would exist through deploying new versions of the actual application.


### List Stacks

`node cli stacks`

### Create New Stacks

Will create a new stack and keypair based on the Cloudformation template in `../roles/initial-stack-cf.json`.

`node cli stacks create [stack name]`

Options

-k, --keyPair <key_pair>  Specify existing keypair to use when creating future asg. If not specified it will generate and download one for you.

-v, --vpc <vpc> Indicate which VPC to deploy to.

### Remove Stack

Will a) remove all targets/routers/workers associated with the stack b) the stack its self.

`node cli stacks remove [stack name]`

Options

-k, --keyPair <key_pair>  If keypair is specified it will delete it too.


## Targets

Targets are the concept of the Zetta-target portion of the architecture. A version is a Cloudformation stack based on `../roles/target/cloudformation.json` and an AMI specified. This creates a Autoscale group based on the AMI.


### List Targets

List all targets currently deployed.

`node cli targets [stack name]`


### Create Target

Create a new version, ami must be specified.

`node cli targets create [stack name] -a [ami]`

Options:

  -a, --ami <ami>             Existing AMI to use. Must be specified.

  --type <instance type>      Instance type to use. [t2.micro]

  -s, --size <cluster stize>  Size of Autoscale group. [1]

  --version <app version>     Logical version of the app being deployed. If not specified it will generate one.

  -v, --vpc <vpc> Indicate which VPC to deploy to.

### Remove Target

Remove version

`node cli targets remove [stack name] [version]`

### Scale Target

Scale a targets Autoscale group to a desired size.

`node cli targets scale [stack name] [version] -s [size]`

Options:

  -s, --size <cluster stize>  Size of Autoscale group.


## Routers

Routers are an ASG of instances running multi-cloud's proxy. These are what the ELB routes to.

### List Routers

List all routers currently deployed.

`node cli routers [stack name]`


### Create Router

Create a new version, ami must be specified.

`node cli routers create [stack name] -a [ami]`

Options:

  -a, --ami <ami>             Existing AMI to use. Must be specified.

  --type <instance type>      Instance type to use. [t2.micro]

  -s, --size <cluster stize>  Size of Autoscale group. [1]

  --version <app version>     Logical version of the app being deployed. If not specified it will generate one.

  -v, --vpc <vpc> Indicate which VPC to deploy to.

### Remove Router

Remove version

`node cli routers remove [stack name] [version]`

### Scale Router

Scale a versions Autoscale group to a desired size.

`node cli routers scale [stack name] [version] -s [size]`

Options:

  -s, --size <cluster stize>  Size of Autoscale group.


## Traffic

Traffic allows you to route ELB traffic to an ASG of routers or set the specific version of zetta targets to use.

### Traffic Zetta

Traffic zetta allows you to set the current version of zetta to use in the zetta routers. This is set by updating a etcd key `/zetta/version` with a json object that contains {"version": "some version id"}


#### Show Current Version

`node cli traffic zetta [stack name] -k [pem file]`

#### Set version

`node cli traffic zetta [stack name] -k [pem file] --version [version id]`


### Traffic ELB

With each stack created, one ELB is created for a stack. This routes traffic to instances in a version. You can you the traffic command to perform the Blue/Green switch between versions.

#### Show Current Traffic

List all instances being routed to by the ELB.

`node cli traffic elb [stack name]`

#### Route to Specific Version

Route traffic to a version. This will add all instances from the version's ASG to the ELB and wait for them to be InService on the ELb. Then it will remove any instances from the ELB that are not part of the version. Last step can be disabled with `--no-replace`

`node cli traffic elb [stack name] --version [version]`


Options:

  --version <app version>  Logical version of the app being deployed

  --no-replace             Do not replace any versions.
