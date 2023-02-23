#!/bin/sh -l
export PATH="/tmp/bin:$PATH"
#export PATH="$PATH:/usr/bin/go"
export POLARIS_HOME=/root/.synopsys/polaris
echo $(ls)
echo $PATH
printenv
cd $GITHUB_WORKSPACE
echo $(ls)
git config --global --add safe.directory $GITHUB_WORKSPACE
git status
node /root/dist/index.js