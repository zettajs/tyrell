# Deployment CLI


```
Usage: cli [options] [command]


Commands:

  stacks                 list all stacks, and sub commands
  versions [stack-name]  list zetta versions, and sub commands
  traffic [stack-name]   switch elb traffic to a specific ASG version
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

## Stacks

Stacks would refer to example "Centralite Production", these would exist through deploying new versions of the actual application.


### List Stacks

`node cli stacks`

### Create New Stacks

Will create a new stack and keypair based on the Cloudformation template in `../aws/initial-stack-cf.json`.

`node cli stacks create [stack name]`

Options

-k, --keyPair <key_pair>  Specify existing keypair to use when creating future asg. If not specified it will generate and download one for you.

### Remove Stack

Will a) remove all versions associated with the stack b) the stack its self.

`node cli stacks remove [stack name]`

Options

-k, --keyPair <key_pair>  If keypair is specified it will delete it too.


## Versions

Versions are the concept of the Zetta portion of the architecture. This would include a cluster of machines running `zetta-proxy`, `zetta-registry`, and multiple `zetta-targets`. A version is a Cloudformation stack based on `../aws/zetta-asg-cf.json` and an AMI specified. This creates a Autoscale group based on the AMI.


### List Versions

List all versions currently deployed.

`node cli versions [stack name]`


### Create Version

Create a new version, ami must be specified.

`node cli versions create [stack name] -a [ami]`

Options:

  -a, --ami <ami>             Existing AMI to use. Must be specified.

  --type <instance type>      Instance type to use. [t2.micro]

  -s, --size <cluster stize>  Size of Autoscale group. [1]

  --version <app version>     Logical version of the app being deployed. If not specified it will generate one.


### Remove Version

Remove version

`node cli versions remove [stack name] [version]`

### Scale Version

Scale a versions Autoscale group to a desired size.

`node cli versions remove [stack name] [version] -s [size]`

Options:

  -s, --size <cluster stize>  Size of Autoscale group.


## Traffic

With each stack created, one ELB is created for a stack. This routes traffic to instances in a version. You can you the traffic command to perform the Blue/Green switch between versions.

### Show Current Traffic

List all instances being routed to by the ELB.

`node cli traffic [stack name]`

### Route to Specific Version

Route traffic to a version. This will add all instances from the version's ASG to the ELB and wait for them to be InService on the ELb. Then it will remove any instances from the ELB that are not part of the version. Last step can be disabled with `--no-replace`

`node cli traffic [stack name] --version [version]`


Options:

  --version <app version>  Logical version of the app being deployed

  --no-replace             Do not replace any versions.
