#!/bin/sh -l

export GH_TOKEN=${1}
export BRANCH=${2}

echo $(ls)
printenv

node /root/index.js

cd /github/workspace
echo $(ls)
echo "workspace"
cd /root
echo $(ls)