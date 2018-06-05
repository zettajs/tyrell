# -*- mode: ruby -*-
# vi: set ft=ruby :
require 'fileutils'

Vagrant.require_version ">= 1.6.0"

CONFIG = File.join(File.dirname(__FILE__), "config.rb")
CLOUD_CONFIG_PATH = File.join(File.dirname(__FILE__))

$num_instances_zetta=1
$num_instances_router=1
$num_instances_analytics=1
$update_channel = "stable"

$device_to_cloud = false
$realtime_analytics = false

if File.exist?(CONFIG)
  require CONFIG
end

def init_machine(config, i, type, n)
  config.vm.define vm_name = "%s-%s-%02d" % ["link", type, i] do |config|
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

    ip = "172.17.8.#{n+100}"
    config.vm.network :private_network, ip: ip

    config.vm.provision :file, :source => "#{CLOUD_CONFIG_PATH}/#{type}-user-data", :destination => "/tmp/vagrantfile-user-data"
    config.vm.provision :shell, :inline => "mv /tmp/vagrantfile-user-data /var/lib/coreos-vagrant/", :privileged => true
    config.vm.provision :shell, :inline => "sudo coreos-cloudinit --from-file /var/lib/coreos-vagrant/vagrantfile-user-data", :privileged => true
    config.vm.provision :shell, :inline => "sudo systemctl start etcd2 &", :privileged => true

    target_dir = ENV['TYRELL_TARGET_DIR']
    proxy_dir = ENV['TYRELL_PROXY_DIR']

    config.vm.synced_folder target_dir, "/home/core/target", id: "target", :nfs => true, :mount_options => ["nolock,vers=3,udp"] if target_dir
    config.vm.synced_folder proxy_dir, "/home/core/proxy", id: "proxy", :nfs => true, :mount_options => ["nolock,vers=3,udp"] if proxy_dir
    config.vm.synced_folder "dev/", "/home/core/dev", id: "dev", :nfs => true, :mount_options => ['nolock,vers=3,udp']
    config.vm.synced_folder "roles/database/sql/", "/home/core/sql", id: "sql", :nfs => true, :mount_options => ["nolock,vers=3,udp"]
    config.vm.synced_folder "packer/services", "/home/core/services", id: "services", :nfs => true, :mount_options => ["nolock,vers=3,udp"]

    config.vm.network "forwarded_port", guest: 2375, host: 2375, auto_correct: true
  end
end

Vagrant.configure(2) do |config|
  count = 0

  count+=1
  init_machine(config, 1, "metrics", count)

  (1..$num_instances_zetta).each do |i|
    count+=1
    init_machine(config, i, "target", count)
  end

  (1..$num_instances_router).each do |i|
    count+=1
    init_machine(config, i, "router", count)
  end

  if $device_to_cloud then
    count+=1
    init_machine(config, 1, "mqttbroker", count)
  end

  if $realtime_analytics then
    count+=1
    init_machine(config, 1, "analytics", count)
  end
end
