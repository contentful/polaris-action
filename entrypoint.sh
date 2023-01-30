#!/bin/sh -l
export PATH="/tmp/bin:$PATH"
echo $(ls)
echo $PATH
printenv
cd $GITHUB_REPOSITORY
node /root/dist/index.js