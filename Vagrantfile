# -*- mode: ruby -*-
# vi: set ft=ruby :
require 'fileutils'

Vagrant.require_version ">= 1.6.0"

require_relative 'vagrant/change_host_name.rb'
require_relative 'vagrant/configure_networks.rb'
require_relative 'vagrant/base_mac.rb'

CONFIG = File.join(File.dirname(__FILE__), "config.rb")
CLOUD_CONFIG_PATH = File.join(File.dirname(__FILE__))

$num_instances_zetta=1
$num_instances_router=1
$instance_name_prefix = "core"
$update_channel = "alpha"

if File.exist?(CONFIG)
  require CONFIG
end


def init_machine(config, i, type)

  config.vm.define vm_name = "%s-%02d" % [$instance_name_prefix, i] do |config|
    config.vm.box = "zetta-coreos-%s-build" % $update_channel
    config.vm.hostname = vm_name

    config.vm.box_version = ">= 0"
    config.vm.box_url = "http://%s.release.core-os.net/amd64-usr/current/coreos_production_vagrant.json" % $update_channel

    config.ssh.insert_key = false
    config.ssh.username = "core"

    config.vm.synced_folder ".", "/vagrant", disabled: true

    config.vm.provider :virtualbox do |v|
      v.check_guest_additions = false
      v.functional_vboxsf = false

      v.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
      v.customize ["modifyvm", :id, "--natdnsproxy1", "on"]
    end

    if Vagrant.has_plugin?("vagrant-vbguest") then
      config.vbguest.auto_update = false
    end

    ip = "172.17.8.#{i+100}"
    config.vm.network :private_network, ip: ip

    config.vm.provision :file, :source => "#{CLOUD_CONFIG_PATH}/#{type}-user-data", :destination => "/tmp/vagrantfile-user-data"
    config.vm.provision :shell, :inline => "mv /tmp/vagrantfile-user-data /var/lib/coreos-vagrant/", :privileged => true
    config.vm.provision :shell, :inline => "sudo coreos-cloudinit --from-file /var/lib/coreos-vagrant/vagrantfile-user-data", :privileged => true

    config.vm.synced_folder "dev/", "/home/core/dev", id: "dev", :nfs => true, :mount_options => ['nolock,vers=3,udp']

    config.vm.network "forwarded_port", guest: 2375, host: 2375, auto_correct: true
  end
end

Vagrant.configure(2) do |config|

  (1..$num_instances_zetta).each do |i|
    init_machine(config, i, "zetta")
  end

  (($num_instances_zetta+1)..($num_instances_router+$num_instances_zetta)).each do |i|
    init_machine(config, i, "router")
  end

end
