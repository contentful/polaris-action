// import fs from 'fs'
import { promises as fs } from "fs";
import os from "os";
import * as path from "path";
import { info } from '@actions/core'
import 'source-map-support/register'
import {
  coverityCreateNoLongerPresentMessage,
  coverityIsPresent,
  DiffMap,
  githubCreateIssueComment,
  githubCreateReview,
  githubGetDiffMap,
  githubGetExistingIssueComments,
  githubGetExistingReviewComments,
  githubGetPullRequestDiff,
  githubIsPullRequest,
  githubUpdateExistingIssueComment,
  githubUpdateExistingReviewComment,
  polarisCreateReviewCommentMessage,
  polarisGetBranches,
  polarisGetIssuesUnified,
  polarisGetRuns,
  polarisIsInDiff,
  isIssueAllowed, readSecurityGateFiltersFromString, githubCreateCheck, logger, POLARIS_COMMENT_PREFACE
} from './utils'
import {
  CoverityIssueOccurrence,
  CoverityIssuesView,
  NewReviewComment,
  PolarisTaskInputs,
  IPolarisIssueUnified,
} from './interfaces'

import {
  PolarisInputReader,
  PolarisConnection,
  PolarisService,
  ChangeSetEnvironment,
  ChangeSetFileWriter,
  ChangeSetReplacement,
  PolarisInstaller,
  PolarisInstall,
  PolarisRunner,
  PolarisIssueWaiter
} from "./classes";

import {
  DEBUG, GITHUB_TOKEN,
  POLARIS_ACCESS_TOKEN, POLARIS_COMMAND,
  POLARIS_URL,
  SECURITY_GATE_FILTERS,
  FAIL_ON_ERROR,
  SKIP_RUN,
  REPORT_URL
} from "./inputs";

import { context } from "@actions/github";
import { Octokit } from "@octokit/rest";
import { CHECK_NAME } from "./application-constants";

interface IPolarisNewResult {
  "mergeKey": string,
  "type": string,
  "location": string
}

export async function githubGetChangesForPR(github_token: string): Promise<Array<string>> {
  let changed_files = new Array()

  const octokit = new Octokit({ auth: github_token })

  let base = context.payload.pull_request?.base?.sha
  let head = context.payload.pull_request?.head?.sha

  logger.debug(`Get changes for Pull Request based on base commit: ${base} and head commit: ${head}`)

  const response = await octokit.repos.compareCommits({
    base,
    head,
    owner: context.repo.owner,
    repo: context.repo.repo
  })

  if (response.status !== 200) {
    logger.error(`The GitHub API for comparing the base and head commits for this ${context.eventName} event returned ${response.status}, expected 200.`)
    return (changed_files)
  }

  const files = response.data.files
  if (files) {
    for (const file of files) {
      // file extensions
      if (/\.(js|ts|tsx|go|rb|py|java)$/i.test(file.filename))
        switch (file.status) {
          case 'added':
            logger.debug(`Change set added file: ${file.filename}`)
            changed_files.push(file.filename)
            break
          case 'modified':
            logger.debug(`Change set modified file: ${file.filename}`)
            changed_files.push(file.filename)
            break
          case 'renamed':
            logger.debug(`Change set renamed file: ${file.filename}`)
            changed_files.push(file.filename)
            break
        }
    }
  }

  return (changed_files)
}

async function run(): Promise<void> {
  logger.info('Starting Coverity GitHub Action')

  let polarisPolicyCheck;
  if (FAIL_ON_ERROR === "true") {
    polarisPolicyCheck = await githubCreateCheck(CHECK_NAME, GITHUB_TOKEN);
  }
  try {
    if (DEBUG === "true") {
      logger.level = 'debug'
      logger.debug(`Enabled debug mode`)
    }

    logger.info(`Connecting to Polaris service at: ${POLARIS_URL}`)

    var timerDate = new Date(1574460000000);
    logger.debug(`Date=${timerDate}`)

    let securityGateFilters = undefined
    if (SECURITY_GATE_FILTERS) {
      try {
        securityGateFilters = readSecurityGateFiltersFromString(SECURITY_GATE_FILTERS)
      } catch (error) {
        logger.error(`Unable to parse security gate filters: ${error}`)
        polarisPolicyCheck?.cancelCheck()
        process.exit(2)
      }
    }
    logger.debug(`Security gate filter: ${securityGateFilters}`)

    let isIncremental = false;
    githubIsPullRequest() ? isIncremental = true : false;

    const task_input: PolarisTaskInputs = new PolarisInputReader().getPolarisInputs(POLARIS_URL, POLARIS_ACCESS_TOKEN,
      POLARIS_COMMAND, !isIncremental, isIncremental, false)
    const connection: PolarisConnection = task_input.polaris_connection;

    logger.info("Connecting to Polaris Software Integrity Platform server.")
    const polaris_service = new PolarisService(logger, connection);
    await polaris_service.authenticate();
    logger.debug("Authenticated with polaris.");

    try {
      logger.debug("Fetching organization name and task version.");
      const org_name = await polaris_service.fetch_organization_name();
      logger.debug(`Organization name: ${org_name}`)

    } catch (e) {
      logger.debug("Unable to fetch org name.");
    }

    let polaris_run_result = undefined

    if (SKIP_RUN) {
      polaris_run_result = {
        scan_cli_json_path: ".blackduck/polaris/cli-scan.json",
        return_code: 0
      }
    } else {
      process.env.GIT_BRANCH = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME
      var actual_build_command = `${POLARIS_COMMAND}`
      if (githubIsPullRequest() && task_input.should_populate_changeset) {
        logger.debug("Populating change set for Polaris Software Integrity Platform.");
        const changed_files = await githubGetChangesForPR(GITHUB_TOKEN)
        for (const file in changed_files) {
          logger.debug(`Found changed file: ${file}`)
        }
        if (changed_files.length == 0 && task_input.should_empty_changeset_fail) {
          logger.error(` Task failed: No changed files were found.`)
          polarisPolicyCheck?.cancelCheck()
          return;
        } else if (changed_files.length == 0) {
          logger.info("Task finished: No changed files were found.")
          polarisPolicyCheck?.cancelCheck()
          return;
        }
        const change_set_environment = new ChangeSetEnvironment(logger, process.env);
        const change_file = change_set_environment.get_or_create_file_path(process.cwd());
        change_set_environment.set_enable_incremental();
        logger.info("changed files: ", changed_files);
        logger.info("changed files set: ", [...new Set(changed_files)]);
        await new ChangeSetFileWriter(logger).write_change_set_file(change_file, [...new Set(changed_files)]);
        actual_build_command += " --incremental $CHANGE_SET_FILE_PATH"
        actual_build_command = new ChangeSetReplacement().replace_build_command(actual_build_command, change_file);
      }

      // logger.info("Installing Polaris Software Integrity Platform.");
      var polaris_installer = PolarisInstaller.default_installer(logger, polaris_service);
      var polaris_install: PolarisInstall = await polaris_installer.install_or_locate_polaris(connection.url);
      logger.info("Found Polaris Software Integrity Platform: " + polaris_install.polaris_executable);
      logger.info("Running Polaris Software Integrity Platform.");
      var polaris_runner = new PolarisRunner(logger);
      // await polaris_runner.execute_cli(connection, polaris_install, process.cwd(), 'analyze');
      polaris_run_result = await polaris_runner.execute_cli(connection, polaris_install, process.cwd(), actual_build_command);
      logger.debug(`Scan result ${JSON.stringify(polaris_run_result)}`)
      if (task_input.should_wait_for_issues) {
        logger.info("Checking for issues.")
        var polaris_waiter = new PolarisIssueWaiter(logger);
        var issue_count;
        try {
          const scanPath = polaris_run_result.scan_cli_json_path;
          const scanFileExists = await fs.stat(scanPath).then(() => true).catch(() => false);
          if (scanFileExists){
          issue_count = await polaris_waiter.wait_for_issues(polaris_run_result.scan_cli_json_path, polaris_service);
          } else issue_count = 0;
          // Ignore, we will calculate issues separately
          logger.error(`Polaris Software Integrity Platform found ${issue_count} total issues.`)
        } catch (error) {
          console.log(error)
          logger.error(`Cannot read polaris issues `)
          polarisPolicyCheck?.cancelCheck()
          process.exit(2)
        }
      } else {
        logger.info("Will not check for issues.")
      }
    }

    if (!polaris_run_result) {
      logger.error(`Unable to find Polaris run results.`)
      polarisPolicyCheck?.cancelCheck()
      process.exit(2)
    }

    let issuesUnified = undefined

    if (isIncremental) {
      const resultsGlobber = require('fast-glob');
      const resultsJson = await resultsGlobber([`.blackduck/polaris/data/coverity/*/idir/incremental-results/incremental-results.json`]);

      if (!resultsJson || resultsJson?.length == 0) {
        logger.error(`Unable to find Polaris run results.`)
        polarisPolicyCheck?.cancelCheck()
      }

      logger.debug(`Incremental results in ${resultsJson[0]}`)

      const newResultsJson = await resultsGlobber([`.blackduck/polaris/data/coverity/*/idir/incremental-results/new-issues.json`]);
      let newResultsContent, newResults, jsonV7Content, coverityIssues;
      if (newResultsJson[0]) {
        newResultsContent = await fs.readFile(newResultsJson[0])
        newResults = JSON.parse(newResultsContent.toString()) as IPolarisNewResult[]
      }
      if (resultsJson[0]) {
        // TODO validate file exists and is .json?
        jsonV7Content = await fs.readFile(resultsJson[0])
        coverityIssues = JSON.parse(jsonV7Content.toString()) as CoverityIssuesView
      }
      issuesUnified = new Array()
      if (coverityIssues?.issues)
        for (const issue of coverityIssues.issues) {
          if (newResults)
            for (const newResult of newResults) {
              if (issue.mergeKey == newResult.mergeKey) {
                let issueUnified = <IPolarisIssueUnified>{}
                issueUnified.key = issue.mergeKey
                issueUnified.name = issue.subcategory
                if (issue.checkerProperties?.subcategoryLongDescription) {
                  issueUnified.description = issue.checkerProperties?.subcategoryLongDescription
                } else {
                  issueUnified.description = issue.subcategory
                }
                if (issue.checkerProperties?.subcategoryLocalEffect) {
                  issueUnified.localEffect = issue.checkerProperties?.subcategoryLocalEffect
                } else {
                  issueUnified.localEffect = "(Local effect not available)"
                }
                issueUnified.checkerName = issue?.checkerName
                issueUnified.path = issue.strippedMainEventFilePathname
                issueUnified.line = issue.mainEventLineNumber
                if (issue.checkerProperties?.impact) {
                  issueUnified.severity = issue.checkerProperties?.impact
                } else {
                  issueUnified.severity = "(Unknown impact)"
                }
                if (issue.checkerProperties?.cweCategory) {
                  issueUnified.cwe = issue.checkerProperties?.cweCategory
                } else {
                  issueUnified.cwe = "(No CWE)"
                }
                issueUnified.mainEvent = ""
                issueUnified.mainEventDescription = "(Main event description not available)"
                issueUnified.remediationEvent = ""
                issueUnified.remediationEventDescription = ""
                for (const event of issue.events) {
                  if (event.main) {
                    issueUnified.mainEvent = event.eventTag
                    issueUnified.mainEventDescription = event.eventDescription
                  }
                  if (event.eventTag == "remediation") {
                    issueUnified.remediationEvent = event.eventTag
                    issueUnified.remediationEventDescription = event.eventDescription
                  }
                }
                issueUnified.dismissed = false
                issueUnified.events = []
                issueUnified.link = "N/A" // TODO: Fix this up

                if (!isIssueAllowed(securityGateFilters, issueUnified.severity, issueUnified.cwe, githubIsPullRequest() ? true : false))
                  issuesUnified.push(issueUnified)

                break
              }
            }
        }
    } else {
      if (!(await fs.stat(polaris_run_result.scan_cli_json_path).catch(() => false))) {
        logger.warn(`Polaris scan file not found at ${polaris_run_result.scan_cli_json_path}. Skipping issue processing.`);
        polarisPolicyCheck?.cancelCheck();
        return;
      }
      var scan_json_text = await fs.readFile(polaris_run_result.scan_cli_json_path);
      var scan_json = JSON.parse(scan_json_text.toString());
      const json_path = require('jsonpath');
      var project_id = json_path.query(scan_json, "$.projectInfo.projectId")
      var branch_id = json_path.query(scan_json, "$.projectInfo.branchId")
      var revision_id = json_path.query(scan_json, "$.projectInfo.revisionId")

      logger.debug(`Connect to Polaris: ${polaris_service.polaris_url} and fetch issues for project: ${project_id} and branch: ${branch_id}`)

      let runs = await polarisGetRuns(polaris_service, project_id, branch_id)

      if (runs.length > 1) {
        logger.debug(`Most recent run is: ${runs[0].id} was created on ${runs[0].attributes["creation-date"]}`)
        logger.debug(`Last run is: ${runs[1].id} was created on ${runs[1].attributes["creation-date"]}`)
        logger.debug(`...`)
      }

      let branches = await polarisGetBranches(polaris_service, project_id)

      if (githubIsPullRequest()) {
        let merge_target_branch = process.env["GITHUB_BASE_REF"]
        if (!merge_target_branch) {
          logger.error(`Running on a pull request and cannot find GitHub environment variable GITHUB_BASE_REF`)
          polarisPolicyCheck?.cancelCheck()
          process.exit(2)
        }
        let branches = await polarisGetBranches(polaris_service, project_id)
        let branch_id_compare = undefined
        for (const branch of branches) {
          if (branch.attributes.name == merge_target_branch) {
            logger.debug(`Running on pull request, and target branch is '${merge_target_branch}' which has Polaris ID ${branch.id}`)
            branch_id_compare = branch.id
          }
        }

        if (!branch_id_compare) {
          logger.error(`Running on pull request and unable to find previous Polaris analysis for merge target: ${merge_target_branch}, will fall back to full results`)
        } else {
          issuesUnified = await polarisGetIssuesUnified(polaris_service, project_id, branch_id,
            true, runs[0]?.id, false, branch_id_compare, "", "opened")
        }
      }

      if (!issuesUnified) {
        logger.debug(`No pull request or merge comparison available, fetching full results`)
        issuesUnified = await polarisGetIssuesUnified(polaris_service, project_id, branch_id,
          true, runs[0]?.id, false, "", "", "")
      }
    }

    logger.info("Executed Polaris Software Integrity Platform: " + polaris_run_result.return_code);

    if (githubIsPullRequest()) {
      const newReviewComments = []
      const actionReviewComments = await githubGetExistingReviewComments(GITHUB_TOKEN).then(comments => comments.filter(comment => comment.body.includes(POLARIS_COMMENT_PREFACE)))
      const actionIssueComments = await githubGetExistingIssueComments(GITHUB_TOKEN).then(comments => comments.filter(comment => comment.body?.includes(POLARIS_COMMENT_PREFACE)))
      const diffMap = await githubGetPullRequestDiff(GITHUB_TOKEN).then(githubGetDiffMap)
      for (const issue of issuesUnified) {
        logger.info(`Found Polaris Issue ${issue.key} at ${issue.path}:${issue.line}`)

        let ignoredOnServer = issue.dismissed

        const reviewCommentBody = polarisCreateReviewCommentMessage(issue, REPORT_URL)
        const issueCommentBody = polarisCreateReviewCommentMessage(issue, REPORT_URL)

        const cwd = path.relative(process.env["GITHUB_WORKSPACE"] || process.cwd(), ".");
        const reviewCommentIndex = actionReviewComments.findIndex(comment => comment.line === issue.line &&
          comment.body.includes(issue.key))
        let existingMatchingReviewComment = undefined
        if (reviewCommentIndex !== -1) {
          existingMatchingReviewComment = actionReviewComments.splice(reviewCommentIndex, 1)[0]
        }

        const issueCommentIndex = actionIssueComments.findIndex(comment => comment.body?.includes(issue.key))
        let existingMatchingIssueComment = undefined
        if (issueCommentIndex !== -1) {
          existingMatchingIssueComment = actionIssueComments.splice(issueCommentIndex, 1)[0]
        }

        if (existingMatchingReviewComment !== undefined) {
          logger.info(`Issue already reported in comment ${existingMatchingReviewComment.id}, updating if necessary...`)
          if (existingMatchingReviewComment.body !== reviewCommentBody) {
            githubUpdateExistingReviewComment(GITHUB_TOKEN, existingMatchingReviewComment.id, reviewCommentBody)
          }
        } else if (existingMatchingIssueComment !== undefined) {
          logger.info(`Issue already reported in comment ${existingMatchingIssueComment.id}, updating if necessary...`)
          if (existingMatchingIssueComment.body !== issueCommentBody) {
            githubUpdateExistingIssueComment(GITHUB_TOKEN, existingMatchingIssueComment.id, issueCommentBody)
          }
        } else if (ignoredOnServer) {
          logger.info('Issue ignored on server, no comment needed.')
        } else if (polarisIsInDiff(issue, diffMap)) {
          logger.info('Issue not reported, adding a comment to the review.')
          newReviewComments.push(createReviewComment(issue, reviewCommentBody))
        } else {
          logger.info('Issue not reported, adding an issue comment.')
          // githubCreateIssueComment(GITHUB_TOKEN, issueCommentBody)
        }
      }

      if (newReviewComments.length > 0) {
        info('Publishing review...')
        githubCreateReview(GITHUB_TOKEN, newReviewComments)
      }
    }

    logger.info(`Found ${issuesUnified.length} Reported Polaris issues.`)

    let security_gate_pass = true
    if (securityGateFilters) {
      logger.debug(`Checking security gate...`)
      for (const issue of issuesUnified) {
        logger.debug(`Test issue ${issue.key} severity: ${issue.severity} cwe: ${issue.cwe}`)
        if (!isIssueAllowed(securityGateFilters, issue.severity, issue.cwe, githubIsPullRequest() ? true : false)) {
          logger.debug(`Issue ${issue.key} does not pass security gate filters`)
          security_gate_pass = false
          break
        }
      }
    }

    if (!security_gate_pass) {
      logger.error(`Security gate failure, setting status check to failure`)
      polarisPolicyCheck?.failCheck('Issues found that violate your security gate filters', '')
    } else {
      polarisPolicyCheck?.passCheck('No issues violated your security gate filters', '')
    }

  } catch (unhandledError) {
    logger.debug('Canceling policy check because of an unhandled error.')
    polarisPolicyCheck?.cancelCheck()
    console.log(unhandledError)
    logger.error(`Failed due to an unhandled error: '${unhandledError}'`)
  }
}

function createReviewComment(issue: IPolarisIssueUnified, commentBody: string): NewReviewComment {
  return {
    path: issue.path,
    body: commentBody,
    line: issue.line,
    side: 'RIGHT'
  }
}

run()
