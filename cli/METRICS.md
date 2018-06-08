# Deploy a ELK stack to Link Infrastructure

This document will take you through the necessary steps of deploying a single box ELK stack to AWS.

## Commands

```

  Usage: cli-metrics [options] [command]


  Commands:

    create      create a new metrics ASG from ami
    remove      remove metrics ASG
    assign      assign a metrics box to a domain
    help [cmd]  display help for [cmd]

  Options:

    -h, --help  output usage information
```

### Create

This command will start up a metrics box using a cloudformation template.

```
node cli/cli-metrics-create.js --ami <AMI_ID> <STACK_NAME>
```

### Remove

This command will remove a metrics box from AWS.

```
node cli/cli-metrics-remove.js <STACK_NAME>
```
### Assign

This command will assign a metrics box to a subdomain on *.iot.company.net.

```
node cli/cli-metrics-assign.js <STACK_NAME> <SUBDOMAIN>
```
