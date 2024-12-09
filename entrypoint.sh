#!/bin/sh -l
export PATH="/tmp/bin:$PATH"
export POLARIS_HOME=/root/.blackduck/polaris
echo $(ls)

cd $GITHUB_WORKSPACE

if [ ! -f polaris.yml ]; then
    echo "polaris.yml not found!"
    mv /root/.polaris.yml polaris.yml
fi
git config --global --add safe.directory $GITHUB_WORKSPACE
node /root/dist/index.js
