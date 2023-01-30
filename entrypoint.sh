#!/bin/sh -l

export GH_TOKEN=${1}
export BRANCH=${2}

echo $(ls)
printenv

node /root/dist/index.js

echo "workspace"
cd /root
echo $(ls)