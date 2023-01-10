In an ideal scenario a DevSecOps pipeline would have a workflow as follows:

Developer pushes source code to Github which activates our CI pipeline, starts security checks and reports a critical vulnerability (if found!), which in turn blocks the pipeline and prevents it from landing in production.

But in reality, when you integrate these security checks in pipeline, they introduce a lot of false-positives which have to be triaged or take hours to complete the scan on a monorepo, devs are irritated as pipeline is blocked and releases are delayed (which can’t be afforded!), so the pipelines are run in no-noise, no-action mode or temporarily disabled.

This new action is based on the feedbadck received from Security Group sync:
https://contentful.atlassian.net/wiki/spaces/seceng/pages/4034854922/2022-10-04+-+Security+Group+Sync+Meeting

Some of the challenges doing SAST scans synchronously are:

Existing issues in Code
The codebase can have an existing huge list of security issues that would be flagged in scans leading to large scan results. The code needs to be cleaned and baselines need to be established first.

Scanning Time
SAST tools have different CPU and Memory performances, some might have good detection but really bad scan times. A balance of performance and credibility needs to be picked and also fine tuned to adjust to the current tech stack of our repos.

Triaging
The scan results need to be verified by the Security Team before being marked as false-positive and dismissed. Creating a pipeline flow to incorporate such visibility and triaging is challenging.

Code Scanning

Static code analyzers detect potential vulnerabilities, and security flaws in a software’s source code without actually running it which helps you achieve a quick automated feedback loop for detecting defects. We have signed up with Polaris for running Code scans on our repositories.
https://github.com/contentful/polaris-action

The scan results will look like this:



We have added PR decoration capabilities which enables PR comments with findings and annotated code snippet to get much better context of the finding.

Adding SAST scans to your repository
We have created a sample Github workflow which could be used as a template to add all these SAST scanning tools in your repository. The job flags can be adjusted to meet the needs like blocking pipelines using fail_on_error and severities to report using security_gate_filters for code scan and kics_flags: "--exclude-severities info,low,medium,trace" for IaC scan.



Reach out to #team-security for any queries