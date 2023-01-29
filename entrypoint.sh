#!/bin/sh -l

export GH_TOKEN=${1}
export BRANCH=${2}

echo $(ls)
printenv

node dist/index.js

cd /github/workspace
echo $(ls)
cd /root
echo $(ls)