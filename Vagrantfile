# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
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
$num_instances_analytics=0
$update_channel = "stable"

$device_to_cloud = false

if File.exist?(CONFIG)
  require CONFIG
end


def init_machine(config, i, type, n)
  config.vm.define vm_name = "%s-%s-%02d" % ["link", type, i] do |config|

    # Box is built with packer locally. Run before: `node cli builds create vagrant -v --core-os-version 1010.6.0`
    config.vm.box = "zetta-coreos-%s-build" % $update_channel
    config.vm.hostname = vm_name

    config.vm.box_version = ">= 0"

    # Note: This isn't actually used. Build local box with `node cli builds create vagrant -v --core-os-version 1010.6.0`
    # pin to 1010.6.0
    # config.vm.box_url = "http://%s.release.core-os.net/amd64-usr/current/coreos_production_vagrant.json" % $update_channel
    # config.vm.box_url = "http://stable.release.core-os.net/amd64-usr/1010.6.0/coreos_production_vagrant.json"
    # config.vm.box_version = "1010.6.0"

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
    tenant_mgmt_dir = ENV['TYRELL_TENANT_MGMT_DIR']

    config.vm.synced_folder target_dir, "/home/core/target", type: "nfs"  if target_dir
    config.vm.synced_folder proxy_dir, "/home/core/proxy", type: "nfs" if proxy_dir
    config.vm.synced_folder "dev/", "/home/core/dev", type: "nfs"
    config.vm.synced_folder "roles/database/sql/", "/home/core/sql/", type: "nfs"
    config.vm.synced_folder "packer/services/", "/home/core/services/", type: "nfs"

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
end
