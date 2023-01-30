#!/bin/sh -l
export PATH="/tmp/bin:$PATH"
export POLARIS_HOME=/root/polaris
echo $(ls)
echo $PATH
printenv
cd $GITHUB_REPOSITORY
node /root/dist/index.js