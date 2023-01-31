#!/bin/sh -l
export PATH="/tmp/bin:$PATH"
export POLARIS_HOME=/root/polaris
echo $(ls)
echo $PATH
printenv
cd $GITHUB_REPOSITORY
echo $(ls)
git config --global --add safe.directory /root/$GITHUB_REPOSITORY
git status
node /root/dist/index.js