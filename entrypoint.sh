#!/bin/sh -l

cd $GITHUB_WORKSPACE

export GH_TOKEN=${1}
export BRANCH=${2}

echo $(ls)
printenv

node dist/index.js