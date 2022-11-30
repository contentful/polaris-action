import { context, getOctokit } from "@actions/github";
import {
    IPolarisIssueUnified, IPolarisBranchData,
    IPolarisIssueData, IPolarisCodeAnalysisEvents,
    IPolarisIssueDataReturn, IPolarisIssueUnifiedEvent,
    IPolarisCodeAnalysisEventsData, IPolarisBranch, IPolarisIssueTriageData,
    IPolarisIssueTriage, IPolarisIssueTriageValue, IPolarisRun, IPolarisRunData
} from "./interfaces";
import { PolarisService } from "./classes";
import { ExistingIssueComment, ExistingReviewComment, NewReviewComment, PullRequest, GitHubCheck } from "./interfaces";
const CaseInsensitiveMap = require('case-insensitive-map')

export const COVERITY_PRESENT = 'PRESENT'
export const COVERITY_NOT_PRESENT = 'NOT_PRESENT'
export const COVERITY_UNKNOWN_FILE = 'Unknown File'
export const COVERITY_COMMENT_PREFACE = '<!-- Comment managed by coverity-report-output-v7, do not modify!'

const prEvents = ['pull_request', 'pull_request_review', 'pull_request_review_comment']
const UNKNOWN_FILE = "Unknown"

const winston = require('winston')
export const logger = winston.createLogger({
    //    level: 'debug',
    transports: [
        new (winston.transports.Console)({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ],
});

export function coverityCreateNoLongerPresentMessage(existingMessage: string): string {
    const existingMessageLines = existingMessage.split('\n')
    return `${existingMessageLines[0]}
${existingMessageLines[1]}
${COVERITY_NOT_PRESENT}
-->
Coverity issue no longer present as of: ${process.env.CI_COMMIT_SHA}
<details>
<summary>Show issue</summary>
${existingMessageLines.slice(4).join('\n')}
</details>`
}

export function coverityIsPresent(existingMessage: string): boolean {
    const lines = existingMessage.split('\n')
    return lines.length > 3 && lines[2] !== COVERITY_NOT_PRESENT
}

export type DiffMap = Map<string, Hunk[]>

export interface Hunk {
    firstLine: number
    lastLine: number
}

export async function githubCreateIssueComment(github_token: string, body: string): Promise<void> {
    const octokit = getOctokit(github_token)

    octokit.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body
    })
}

export function githubIsPullRequest(): boolean {
    return prEvents.includes(context.eventName)
}

export function githubGetPullRequestNumber(): number | undefined {
    let pr_number = undefined
    if (githubIsPullRequest()) {
        const pull = context.payload.pull_request as PullRequest
        if (pull?.number) {
            pr_number = pull.number
        }
    }

    return pr_number
}

export async function githubCreateReview(github_token: string, comments: NewReviewComment[], event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' = 'COMMENT'): Promise<void> {
    const octokit = getOctokit(github_token)

    const pullRequestNumber = githubGetPullRequestNumber()
    if (!pullRequestNumber) {
        return Promise.reject(Error('Could not create Pull Request Review Comment: Action was not running on a Pull Request'))
    }

    console.debug(`PR number: ${pullRequestNumber} owner: ${context.repo.owner} repo: ${context.repo.repo} event: ${event}`)
    octokit.rest.pulls.createReview({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pullRequestNumber,
        event,
        comments
    })
}

export async function githubGetExistingIssueComments(github_token: string): Promise<ExistingIssueComment[]> {
    const octokit = getOctokit(github_token)

    const { data: existingComments } = await octokit.rest.issues.listComments({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo
    })

    return existingComments
}

export async function githubGetExistingReviewComments(github_token: string): Promise<ExistingReviewComment[]> {
    const octokit = getOctokit(github_token)

    const pullRequestNumber = githubGetPullRequestNumber()
    if (!pullRequestNumber) {
        return Promise.reject(Error('Could not create Pull Request Review Comment: Action was not running on a Pull Request'))
    }

    const reviewCommentsResponse = await octokit.rest.pulls.listReviewComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pullRequestNumber
    })

    return reviewCommentsResponse.data
}

export function githubGetDiffMap(rawDiff: string): DiffMap {
    console.info('Gathering diffs...')
    const diffMap = new Map()

    let path = UNKNOWN_FILE
    for (const line of rawDiff.split('\n')) {
        if (line.startsWith('diff --git')) {
            // TODO: Handle spaces in path
            // TODO: Will this continue to work with other GitHub integrations?
            // path = `${process.env.GITHUB_WORKSPACE}/${line.split(' ')[2].substring(2)}`
            path = `${line.split(' ')[2].substring(2)}`

            if (path === undefined) {
                path = UNKNOWN_FILE
            }

            diffMap.set(path, [])
        }

        if (line.startsWith('@@')) {
            let changedLines = line.substring(3)
            changedLines = changedLines.substring(0, changedLines.indexOf(' @@'))

            const linesAddedPosition = changedLines.indexOf('+')
            if (linesAddedPosition > -1) {
                // We only care about the right side because Coverity can only analyze what's there, not what used to be --rotte FEB 2022
                const linesAddedString = changedLines.substring(linesAddedPosition + 1)
                const separatorPosition = linesAddedString.indexOf(',')

                const startLine = parseInt(linesAddedString.substring(0, separatorPosition))
                const lineCount = parseInt(linesAddedString.substring(separatorPosition + 1))
                const endLine = startLine + lineCount - 1

                if (!diffMap.has(path)) {
                    diffMap.set(path, [])
                }
                console.info(`Added ${path}: ${startLine} to ${endLine}`)
                diffMap.get(path)?.push({ firstLine: startLine, lastLine: endLine })
            }
        }
    }

    return diffMap
}

export async function githubGetPullRequestDiff(github_token: string): Promise<string> {
    const octokit = getOctokit(github_token)

    const pullRequestNumber = githubGetPullRequestNumber()

    if (!pullRequestNumber) {
        return Promise.reject(Error('Could not get Pull Request Diff: Action was not running on a Pull Request'))
    }

    const response = await octokit.rest.pulls.get({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: pullRequestNumber,
        mediaType: {
            format: 'diff'
        }
    })

    return response.data as unknown as string
}

export async function githubUpdateExistingIssueComment(github_token: string, commentId: number, body: string): Promise<void> {
    const octokit = getOctokit(github_token)

    octokit.rest.issues.updateComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: commentId,
        body
    })
}

export async function githubUpdateExistingReviewComment(github_token: string, commentId: number, body: string): Promise<void> {
    const octokit = getOctokit(github_token)

    octokit.rest.pulls.updateReviewComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: commentId,
        body
    })
}

export function githubGetSha(): string {
    let sha = context.sha
    if (githubIsPullRequest()) {
        const pull = context.payload.pull_request as PullRequest
        if (pull?.head.sha) {
            sha = pull?.head.sha
        }
    }

    return sha
}


export async function githubCreateCheck(checkName: string, githubToken: string): Promise<GitHubCheck> {
    const octokit = getOctokit(githubToken)

    const head_sha = githubGetSha()

    console.info(`Creating ${checkName}...`)
    const response = await octokit.rest.checks.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        name: checkName,
        head_sha
    })

    if (response.status !== 201) {
        console.warn(`Unexpected status code recieved when creating ${checkName}: ${response.status}`)
        console.debug(JSON.stringify(response, null, 2))
    } else {
        console.info(`${checkName} created`)
    }

    return new GitHubCheck(checkName, response.data.id, githubToken)
}

export function isIssueAllowed(securityFilters: typeof CaseInsensitiveMap,
    severity: string,
    cwe: string,
    isNew: boolean = false): boolean {
    if (securityFilters.get("status") && isNew && securityFilters.get("status")?.indexOf("new") >= 0) {
        return (false)
    }

    if (securityFilters.get("severity") && securityFilters.get("severity")?.indexOf(severity) >= 0) {
        return (false)
    }

    if (securityFilters.get("cwe")) {
        const cweValues = cwe.split(', ')
        for (const cweValue of cweValues) {
            for (cwe of securityFilters.get("cwe")) {
                if (cwe == cweValue) {
                    return (false)
                }
            }
        }
    }

    return (true)
}

export function readSecurityGateFiltersFromString(securityGateString: string): typeof CaseInsensitiveMap {
    const securityGateJson = JSON.parse(securityGateString)
    let securityGateMap = new CaseInsensitiveMap()
    console.debug(`Reading security gate filters`)

    Object.keys(securityGateJson).forEach(function (key) {
        var values = securityGateJson[key]
        console.debug(`  ${key}`)
        securityGateMap.set(key, new Array())
        for (const value of values) {
            securityGateMap.get(key)?.push(value)
            console.debug(`    ${value}`)
        }
    })

    return (securityGateMap)
}

export const POLARIS_COMMENT_PREFACE = '<!-- Comment managed by Synopsys Polaris, do not modify!'
const POLARIS_PRESENT = 'PRESENT'

export function polarisCreateReviewCommentMessage(issue: IPolarisIssueUnified, reportUrl: string): string {
    const CHECKRUN_URL = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    return `${POLARIS_COMMENT_PREFACE}
${issue.key}
${POLARIS_PRESENT}
-->
_${issue.severity} Impact, CWE ${issue.cwe} ${issue.checkerName}_
${issue.mainEventDescription} ${issue.localEffect} 
[View issue details](https://cwe.mitre.org/data/definitions/${issue.cwe}.html)

Remediation:
${issue.remediationEventDescription}
***
🚫 False Positive? [Report](${reportUrl}&body=${CHECKRUN_URL})
`
}

export async function polarisGetBranches(polarisService: PolarisService, projectId: string): Promise<IPolarisBranch[]> {
    let complete = false
    let offset = 0
    let limit = 25

    let collected_branches = Array()

    while (!complete) {
        let branch_page = await polarisGetBranchesPage(polarisService, projectId, limit, offset)
        collected_branches = collected_branches.concat(branch_page.data)
        offset = offset + limit
        if (offset >= branch_page.meta.total) {
            complete = true
        }
    }

    return (collected_branches)
}
export async function polarisGetBranchesPage(polarisService: PolarisService, projectId: string,
    limit: number, offset: number): Promise<IPolarisBranchData> {
    let branches_path = `${polarisService.polaris_url}` +
        `/api/common/v0/branches?` +
        `page%5Blimit%5D=${limit}` +
        `&page%5Boffset%5D=${offset}` +
        `&filter%5Bbranch%5D%5Bproject%5D%5Bid%5D%5B%24eq%5D=${projectId}`

    logger.debug(`Fetch branches from: ${branches_path}`)

    const branch_data = await polarisService.get_url(branches_path)

    logger.debug(`Polaris branch data for projectId ${projectId} : ${JSON.stringify(branch_data.data, null, 2)}`)

    const branches = branch_data.data as IPolarisBranchData

    return (branches)
}

export async function polarisGetIssuesUnified(polarisService: PolarisService, projectId: string,
    branchId: string, useBranch: boolean,
    runId: string, useRun: boolean,
    compareBranchId: string,
    compareRunId: string,
    filterOpenOrClosed: string): Promise<IPolarisIssueUnified[]> {
    let issues = await polarisGetIssues(polarisService, projectId,
        useBranch ? branchId : "",
        useRun ? runId : "",
        compareBranchId, compareRunId, filterOpenOrClosed)

    logger.debug(`There are ${issues.issueData.length} issues for project: ${projectId} and run: ${runId}`)

    let issuesUnified: Array<IPolarisIssueUnified> = new Array()

    for (const issue of issues.issueData) {
        logger.debug(`Issue ${issue.id} has issue key: ${issue.relationships["issue-type"]?.data.id}`)

        let issueEvents = undefined
        try {
            issueEvents = await polarisGetIssueEventsWithSource(polarisService, issue.attributes["finding-key"], runId)
        } catch (error) {
            logger.warn(`Unable to fetch issue events for finding key: ${issue.attributes["finding-key"]} for run: ${runId}`)
        }

        const issueTriage = await polarisGetIssueTriage(polarisService, projectId, issue.attributes["issue-key"])

        let issueUnified = <IPolarisIssueUnified>{}

        let issue_type_id = issue.relationships["issue-type"]?.data.id
        let issue_path_id = issue.relationships.path?.data.id
        let tool_id = issue.relationships.tool?.data.id
        let issue_opened_id = issue.relationships.transitions?.data[0].id
        let issue_severity_id = issue.relationships.severity?.data.id

        issueUnified.key = issue.attributes["issue-key"]
        issueUnified.checkerName = issue.attributes["sub-tool"]

        issueUnified.dismissed = false
        if (issueTriage) {
            let dismissStatus = await polarisGetTriageValue("DISMISS", issueTriage.attributes["triage-current-values"])
            if (dismissStatus && dismissStatus["display-value"] == "Dismissed") {
                issueUnified.dismissed = true
            }
        }

        issueUnified.path = "N/A"
        issueUnified.name = "N/A"
        issueUnified.description = "N/A"
        issueUnified.localEffect = "N/A"
        issueUnified.link = "N/A"
        issueUnified.severity = "N/A"

        for (const included_data of issues.issueIncluded) {
            if (issue_path_id && included_data.type == "path" && included_data.id == issue_path_id) {
                issueUnified.path = included_data.attributes.path ? included_data.attributes.path.join('/') : "N/A"
            }
            if (issue_type_id && included_data.type == "issue-type" && included_data.id == issue_type_id) {
                issueUnified.name = included_data.attributes["name"] ? included_data.attributes["name"] : "N/A"
                issueUnified.description = included_data.attributes["description"] ? included_data.attributes["description"] : "N/A"
                issueUnified.localEffect = included_data.attributes["local-effect"] ? included_data.attributes["local-effect"] : "N/A"
            }
            if (issue_opened_id && included_data.type == "transition" && included_data.id == issue_opened_id) {
                issueUnified.link = `${polarisService.polaris_url}/projects/${projectId}/branches/${branchId}/revisions/` +
                    `${included_data.attributes["revision-id"]}/issues/${issue.attributes["issue-key"]}`
            }
            if (issue_severity_id && included_data.type == "taxon" && included_data.id == issue_severity_id) {
                issueUnified.severity = included_data.attributes.name ? included_data.attributes.name : "N/A"
            }
        }

        issueUnified.cwe = "N/A"
        if (issue.relationships["related-taxa"]) {
            issueUnified.cwe = ""
            for (const taxaData of issue.relationships["related-taxa"].data) {
                if (issueUnified.cwe == "") {
                    issueUnified.cwe = taxaData.id
                } else {
                    issueUnified.cwe += `, ${taxaData.id}`
                }
            }
        }

        issueUnified.mainEvent = "N/A"
        issueUnified.mainEventDescription = "N/A"
        issueUnified.remediationEvent = "N/A"
        issueUnified.remediationEventDescription = "N/A"
        issueUnified.line = 1

        issueUnified.events = new Array()
        if (issueEvents) {
            issueUnified.line = issueEvents[0]["main-event-line-number"]
            for (const event of issueEvents[0].events) {
                if (event["event-type"] == "MAIN") {
                    issueUnified.mainEvent = event["event-tag"]
                    issueUnified.mainEventDescription = event["event-description"]
                }
                if (event["event-tag"] == "remediation") {
                    issueUnified.remediationEvent = event["event-tag"]
                    issueUnified.remediationEventDescription = event["event-description"]
                }

                let issueUnifiedEvent: IPolarisIssueUnifiedEvent = <IPolarisIssueUnifiedEvent>{}
                issueUnifiedEvent.number = event["event-number"]
                issueUnifiedEvent.tag = event["event-tag"]
                issueUnifiedEvent.type = event["event-type"]
                issueUnifiedEvent.description = event["event-description"]
                issueUnifiedEvent["line-number"] = event["line-number"]
                issueUnifiedEvent.filePath = event["filePath"]
                issueUnifiedEvent["source-after"] = event["source-after"]
                issueUnifiedEvent["source-before"] = event["source-before"]

                issueUnified.events.push(issueUnifiedEvent)
            }
        }

        issuesUnified.push(issueUnified)
    }

    return (issuesUnified)
}

export async function polarisGetTriageValue(attribute_name: string, triage_values: IPolarisIssueTriageValue[]):
    Promise<IPolarisIssueTriageValue> {
    for (const value of triage_values) {
        if (attribute_name == value["attribute-semantic-id"]) {
            return value
        }
    }
    return Promise.reject()
}

export async function polarisGetIssues(polarisService: PolarisService, projectId: string, branchId: string, runId: string,
    compareBranchId: string, compareRunId: string, filterOpenOrClosed: string): Promise<IPolarisIssueDataReturn> {
    let complete = false
    let offset = 0
    let limit = 25

    let collected_issues = Array()
    let collected_includes = Array()

    while (!complete) {
        let issues_page = await getIssuesPage(polarisService, projectId, branchId, runId,
            compareBranchId, compareRunId, filterOpenOrClosed,
            limit, offset)
        collected_issues = collected_issues.concat(issues_page.data)
        collected_includes = collected_includes.concat(issues_page.included)
        offset = offset + limit
        if (offset >= issues_page.meta.total) {
            complete = true
        }
    }

    let issueReturn = <IPolarisIssueDataReturn>{}
    issueReturn.issueData = collected_issues
    issueReturn.issueIncluded = collected_includes
    return (issueReturn)
}

export async function getIssuesPage(polarisService: PolarisService, projectId: string, branchId: string, runId: string,
    compareBranchId: string, compareRunId: string,
    filterOpenOrClosed: string,
    limit: number, offset: number): Promise<IPolarisIssueData> {
    let issues_path = `${polarisService.polaris_url}` +
        `/api/query/v1/issues?page[limit]=${limit}` +
        `&page[offset]=${offset}` +
        `&project-id=${projectId}` +
        `&include[issue][]=severity` +
        `&include[issue][]=related-taxa`

    if (branchId.length > 0) {
        issues_path += `&branch-id=${branchId}`
    }

    if (runId.length > 0) {
        issues_path += `&run-id=${runId}`
    }

    if (compareRunId && compareRunId.length > 0) {
        issues_path += `&compare-run-id=${compareRunId}`
    }

    if (compareBranchId && compareBranchId.length > 0) {
        issues_path += `&compare-branch-id=${compareBranchId}`
    }

    if (filterOpenOrClosed && filterOpenOrClosed.length > 0) {
        //issues_path += `&filter[issue][status][$eq]=${filterOpenOrClosed}`
        issues_path += `&filter%5Bissue%5D%5Bstatus%5D%5B%24eq%5D=${filterOpenOrClosed}`

    }

    //  // curl -X GET "https://sipse.polaris.synopsys.com/api/query/v1/issues?p
    //  roject-id=f435f59c-5abb-4957-a725-28d93f0e645b
    //  &branch-id=c7b567ee-39ae-4ca2-8d56-7496d29f32d8
    //  &compare-branch-id=94f11f15-2892-4496-9245-b53b6d25ca10
    //  &filter%5Bissue%5D%5Bstatus%5D%5B%24eq%5D=closed
    //  &page%5Blimit%5D=50" -H "accept: application/vnd.api+json"

    logger.debug(`Fetch issues from: ${issues_path}`)

    const issues_data = await polarisService.get_url(issues_path)

    //logger.debug(`Polaris runs data for projectId ${projectId} and branchId ${branchId} ${JSON.stringify(issues_data.data, null, 2)}`)

    const issues = issues_data.data as IPolarisIssueData

    return (issues)
}

export async function polarisGetIssueEventsWithSource(polarisService: PolarisService,
    findingKey: string, runId: string): Promise<IPolarisCodeAnalysisEvents[]> {
    let events_with_source_path = `${polarisService.polaris_url}` +
        `/api/code-analysis/v0/events-with-source?finding-key=${findingKey}` +
        `&run-id=${runId}` +
        `&occurrence-number=1` +
        `&max-depth=10`

    logger.debug(`Fetch issue events with source from: ${events_with_source_path}`)

    const events_with_source_data = await polarisService.get_url(events_with_source_path)

    logger.debug(`Polaris events with source data for findingKey ${findingKey} and runId ${runId}: ${JSON.stringify(events_with_source_data.data, null, 2)}`)

    const events = events_with_source_data.data as IPolarisCodeAnalysisEventsData

    return (events.data)
}

export async function polarisGetIssueTriage(polarisService: PolarisService, projectId: string, issueKey: string): Promise<IPolarisIssueTriage> {
    let triage_path = `${polarisService.polaris_url}` +
        `/api/triage-query/v1/triage-current/project-id%3A${projectId}` +
        `%3Aissue-key%3A${issueKey}`

    logger.debug(`Fetch issue triage from: ${triage_path}`)

    const triage_data = await polarisService.get_url(triage_path)

    //logger.debug(`Polaris triage data for projectId ${projectId} and issueKey ${issueKey} ${JSON.stringify(triage_data.data, null, 2)}`)

    const triage = triage_data.data as IPolarisIssueTriageData

    return (triage.data)
}

export async function polarisGetRuns(polarisService: PolarisService, projectId: string, branchId: string): Promise<IPolarisRun[]> {
    let complete = false
    let offset = 0
    let limit = 25

    let collected_runs = Array()

    while (!complete) {
        let run_page = await polarisGetRunsPage(polarisService, projectId, branchId, limit, offset)
        collected_runs = collected_runs.concat(run_page.data)
        offset = offset + limit
        if (offset >= run_page.meta.total) {
            complete = true
        }
    }

    return (collected_runs)
}

export async function polarisGetRunsPage(polarisService: PolarisService, projectId: string, branchId: string,
    limit: number, offset: number): Promise<IPolarisRunData> {
    let runs_path = `${polarisService.polaris_url}` +
        `/api/common/v0/runs?page[limit]=${limit}` +
        `&page[offset]=${offset}` +
        `&filter[run][project][id][eq]=${projectId}` +
        `&filter[run][revision][branch][id][eq]=${branchId}`

    logger.debug(`Fetch runs from: ${runs_path}`)

    const run_data = await polarisService.get_url(runs_path)

    //logger.debug(`Polaris runs data for projectId ${projectId} and branchId ${branchId}: ${JSON.stringify(run_data.data, null, 2)}`)

    const runs = run_data.data as IPolarisRunData

    return (runs)
}

export function polarisIsInDiff(issue: IPolarisIssueUnified, diffMap: DiffMap): boolean {
    const diffHunks = diffMap.get(issue.path)

    if (!diffHunks) {
        return false
    }

    return diffHunks.filter(hunk => hunk.firstLine <= issue.line).some(hunk => issue.line <= hunk.lastLine)
}
