# VPC Creation and Deployment

Tyrell now allows for the creation of VPC networks on AWS. Tyrell also now requires a VPC association for any stack components that are going to be created.

## Architecture

Tyrell now creates the following components when creating a VPC.

* 1 VPC
* 4 public subnets
* 4 private subnets
* 4 NAT Gateways
* 1 Internet Gateway
* 1 open internet route association (0.0.0.0/0 to Internet Gateway)
* 4 private internet route associates (0.0.0.0/0 to a NAT Gateway)

## Deployment Structure

Tyrell will now deploy components to the following subnets.

* ELB to public subnets
* Bastion to one public subnet
* Core services to public subnets
* Routers to private subnets
* Targets to private subnets

## CLI

### Network

This is the top level command in tyrell. It has 3 network manipulation commands.

```
$ node cli/cli-network.js --help

  Usage: cli-network [options] [command]


  Commands:

    describe    list resources assigned to a network
    create      create a new network
    remove      remove a network
    help [cmd]  display help for [cmd]

  Options:

    -h, --help  output usage information
```

### Create

This command is to create a new VPC. If you'd like to specify subnets for the VPC or public and private subnets you can do so.

The command takes an additional name argument necessary for naming the cloudformation stack.

```
$ node cli/cli-network.js create --help

  Usage: cli-network-create [options] <name>

  Options:

    -h, --help                   output usage information
    --vpccidrblock [block]       CIDR block for the VPC
    --publiccidrblock [block]    CIDR block for the first public subnet
    --public2cidrblock [block]   CIDR block for the second public subnet
    --public3cidrblock [block]   CIDR block for the third public subnet
    --public4cidrblock [block]   CIDR block for the fourth public subnet
    --privatecidrblock [block]   CIDR block for the first private subnet
    --private2cidrblock [block]  CIDR block for the second private subnet
    --private3cidrblock [block]  CIDR block for the third private subnet
    --private4cidrblock [block]  CIDR block for the fourth private subnet
```

### Remove

This command cleans up all the network resources based on the provided name argument.

**Note** This command will fail if there are instances or any other AWS resources associated with the VPC.

```
$ node cli/cli-network.js remove --help

  Usage: cli-network-remove [options] <name>

  Options:

    -h, --help  output usage information
```

### Describe

This command will describe all the network resources associated with the cloudformation stack.

```
$ node cli/cli-network.js describe --help

  Usage: cli-network-describe [options] <name>

  Options:

    -h, --help  output usage information
```

## Notes on CloudFormation templates

 Two specific considerations to remember about the cloudformation templates.

 1. Security groups need to be associated with a specific VPC. If they aren't the rules won't be created properly.

 2. Individual security group ingress and egress rules need to be associated with a security group id when being created outside of the context of the default VPC. 
