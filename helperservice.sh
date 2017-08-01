#! /bin/bash
docker service create \
	--name vis-helper \
	--network host \
	--mode global \
	--mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
	--constraint  'node.labels.master != true' \
	warpenguin.no-ip.org/warpvisualizerhelper
