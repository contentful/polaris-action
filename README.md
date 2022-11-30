# Polaris GitHub Action

The Polaris GitHub Action provides a simple approach for adding Polaris SAST scans to your GitHub workflows. The
action has the ability to run a scan, and provide feedback to developers as part of their pull request.

## Quick Start

To get started, you can include the template in your pipelines by referencing it as a GitHub Action.
Replace `<version>` with the version of the template you would like to use. You can use `master` to reference the latest version,
but be advised that this is dangerous as it may introduce changes that disrupt your pipeline.

To start using this action, add the following step to your existing GitHub workflow. This enables assumes the specified
Coverity credentials and some reasonable options, which are described in depth in following sections:

```
name: polaris

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  ubuntu:
    name: polaris / ubuntu
    runs-on: ubuntu-latest

    steps:
      - name: Clone repo
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Synopsys Polaris
        uses: contentful/polaris-action@master
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          polaris_url: ${{ secrets.POLARIS_URL }}
          polaris_access_token: ${{ secrets.POLARIS_ACCESS_TOKEN }}
          debug: true
          polaris_command: analyze -w
          # Include the security gate filters - what should cause a policy failure
          security_gate_filters: '{ "severity": ["High", "Medium"] }'
          fail_on_error: false
          report_url: "https://github.com/contentful/security-tools-config/issues/new?title=False%20positive%20in%20Polaris"
```

## Development

Make changes in `src` folder
Run `npm run package` to create dist files
