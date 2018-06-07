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

# -*- mode: ruby -*-
# # vi: set ft=ruby :
# NOTE: This monkey-patching of the coreos guest plugin is a terrible
# hack that needs to be removed once the upstream plugin works with
# alpha CoreOS images.
require 'tempfile'
require Vagrant.source_root.join("plugins/guests/coreos/cap/change_host_name.rb")
CLOUD_CONFIG = <<EOF
#cloud-config
hostname: %s
EOF
module VagrantPlugins
  module GuestCoreOS
    module Cap
      class ChangeHostName
        def self.change_host_name(machine, name)
          machine.communicate.tap do |comm|
            temp = Tempfile.new("coreos-vagrant")
            temp.binmode
            temp.write(CLOUD_CONFIG % [name])
            temp.close
            path = "/var/tmp/hostname.yml"
            path_esc = path.gsub("/", "-")[1..-1]
            comm.upload(temp.path, path)
            comm.sudo("systemctl start system-cloudinit@#{path_esc}.service")
          end
        end
      end
    end
  end
end
