"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.polarisIsInDiff = exports.polarisGetRunsPage = exports.polarisGetRuns = exports.polarisGetIssueTriage = exports.polarisGetIssueEventsWithSource = exports.getIssuesPage = exports.polarisGetIssues = exports.polarisGetTriageValue = exports.polarisGetIssuesUnified = exports.polarisGetBranchesPage = exports.polarisGetBranches = exports.polarisCreateReviewCommentMessage = exports.POLARIS_COMMENT_PREFACE = exports.readSecurityGateFiltersFromString = exports.isIssueAllowed = exports.githubCreateCheck = exports.githubGetSha = exports.githubUpdateExistingReviewComment = exports.githubUpdateExistingIssueComment = exports.githubGetPullRequestDiff = exports.githubGetDiffMap = exports.githubGetExistingReviewComments = exports.githubGetExistingIssueComments = exports.githubCreateReview = exports.githubGetPullRequestNumber = exports.githubIsPullRequest = exports.githubCreateIssueComment = exports.coverityIsPresent = exports.coverityCreateNoLongerPresentMessage = exports.logger = exports.COVERITY_COMMENT_PREFACE = exports.COVERITY_UNKNOWN_FILE = exports.COVERITY_NOT_PRESENT = exports.COVERITY_PRESENT = void 0;
const github_1 = require("@actions/github");
const interfaces_1 = require("./interfaces");
const CaseInsensitiveMap = require('case-insensitive-map');
exports.COVERITY_PRESENT = 'PRESENT';
exports.COVERITY_NOT_PRESENT = 'NOT_PRESENT';
exports.COVERITY_UNKNOWN_FILE = 'Unknown File';
exports.COVERITY_COMMENT_PREFACE = '<!-- Comment managed by coverity-report-output-v7, do not modify!';
const prEvents = ['pull_request', 'pull_request_review', 'pull_request_review_comment'];
const UNKNOWN_FILE = "Unknown";
const winston = require('winston');
exports.logger = winston.createLogger({
    //    level: 'debug',
    transports: [
        new (winston.transports.Console)({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        })
    ],
});
function coverityCreateNoLongerPresentMessage(existingMessage) {
    const existingMessageLines = existingMessage.split('\n');
    return `${existingMessageLines[0]}
${existingMessageLines[1]}
${exports.COVERITY_NOT_PRESENT}
-->
Coverity issue no longer present as of: ${process.env.CI_COMMIT_SHA}
<details>
<summary>Show issue</summary>
${existingMessageLines.slice(4).join('\n')}
</details>`;
}
exports.coverityCreateNoLongerPresentMessage = coverityCreateNoLongerPresentMessage;
function coverityIsPresent(existingMessage) {
    const lines = existingMessage.split('\n');
    return lines.length > 3 && lines[2] !== exports.COVERITY_NOT_PRESENT;
}
exports.coverityIsPresent = coverityIsPresent;
function githubCreateIssueComment(github_token, body) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(github_token);
        octokit.rest.issues.createComment({
            issue_number: github_1.context.issue.number,
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            body
        });
    });
}
exports.githubCreateIssueComment = githubCreateIssueComment;
function githubIsPullRequest() {
    return prEvents.includes(github_1.context.eventName);
}
exports.githubIsPullRequest = githubIsPullRequest;
function githubGetPullRequestNumber() {
    let pr_number = undefined;
    if (githubIsPullRequest()) {
        const pull = github_1.context.payload.pull_request;
        if (pull === null || pull === void 0 ? void 0 : pull.number) {
            pr_number = pull.number;
        }
    }
    return pr_number;
}
exports.githubGetPullRequestNumber = githubGetPullRequestNumber;
function githubCreateReview(github_token, comments, event = 'COMMENT') {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(github_token);
        const pullRequestNumber = githubGetPullRequestNumber();
        if (!pullRequestNumber) {
            return Promise.reject(Error('Could not create Pull Request Review Comment: Action was not running on a Pull Request'));
        }
        console.debug(`PR number: ${pullRequestNumber} owner: ${github_1.context.repo.owner} repo: ${github_1.context.repo.repo} event: ${event}`);
        octokit.rest.pulls.createReview({
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            pull_number: pullRequestNumber,
            event,
            comments
        });
    });
}
exports.githubCreateReview = githubCreateReview;
function githubGetExistingIssueComments(github_token) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(github_token);
        const { data: existingComments } = yield octokit.rest.issues.listComments({
            issue_number: github_1.context.issue.number,
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo
        });
        return existingComments;
    });
}
exports.githubGetExistingIssueComments = githubGetExistingIssueComments;
function githubGetExistingReviewComments(github_token) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(github_token);
        const pullRequestNumber = githubGetPullRequestNumber();
        if (!pullRequestNumber) {
            return Promise.reject(Error('Could not create Pull Request Review Comment: Action was not running on a Pull Request'));
        }
        const reviewCommentsResponse = yield octokit.rest.pulls.listReviewComments({
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            pull_number: pullRequestNumber
        });
        return reviewCommentsResponse.data;
    });
}
exports.githubGetExistingReviewComments = githubGetExistingReviewComments;
function githubGetDiffMap(rawDiff) {
    var _a;
    console.info('Gathering diffs...');
    const diffMap = new Map();
    let path = UNKNOWN_FILE;
    for (const line of rawDiff.split('\n')) {
        if (line.startsWith('diff --git')) {
            // TODO: Handle spaces in path
            // TODO: Will this continue to work with other GitHub integrations?
            // path = `${process.env.GITHUB_WORKSPACE}/${line.split(' ')[2].substring(2)}`
            path = `${line.split(' ')[2].substring(2)}`;
            if (path === undefined) {
                path = UNKNOWN_FILE;
            }
            diffMap.set(path, []);
        }
        if (line.startsWith('@@')) {
            let changedLines = line.substring(3);
            changedLines = changedLines.substring(0, changedLines.indexOf(' @@'));
            const linesAddedPosition = changedLines.indexOf('+');
            if (linesAddedPosition > -1) {
                // We only care about the right side because Coverity can only analyze what's there, not what used to be --rotte FEB 2022
                const linesAddedString = changedLines.substring(linesAddedPosition + 1);
                const separatorPosition = linesAddedString.indexOf(',');
                const startLine = parseInt(linesAddedString.substring(0, separatorPosition));
                const lineCount = parseInt(linesAddedString.substring(separatorPosition + 1));
                const endLine = startLine + lineCount - 1;
                if (!diffMap.has(path)) {
                    diffMap.set(path, []);
                }
                console.info(`Added ${path}: ${startLine} to ${endLine}`);
                (_a = diffMap.get(path)) === null || _a === void 0 ? void 0 : _a.push({ firstLine: startLine, lastLine: endLine });
            }
        }
    }
    return diffMap;
}
exports.githubGetDiffMap = githubGetDiffMap;
function githubGetPullRequestDiff(github_token) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(github_token);
        const pullRequestNumber = githubGetPullRequestNumber();
        if (!pullRequestNumber) {
            return Promise.reject(Error('Could not get Pull Request Diff: Action was not running on a Pull Request'));
        }
        const response = yield octokit.rest.pulls.get({
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            pull_number: pullRequestNumber,
            mediaType: {
                format: 'diff'
            }
        });
        return response.data;
    });
}
exports.githubGetPullRequestDiff = githubGetPullRequestDiff;
function githubUpdateExistingIssueComment(github_token, commentId, body) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(github_token);
        octokit.rest.issues.updateComment({
            issue_number: github_1.context.issue.number,
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            comment_id: commentId,
            body
        });
    });
}
exports.githubUpdateExistingIssueComment = githubUpdateExistingIssueComment;
function githubUpdateExistingReviewComment(github_token, commentId, body) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(github_token);
        octokit.rest.pulls.updateReviewComment({
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            comment_id: commentId,
            body
        });
    });
}
exports.githubUpdateExistingReviewComment = githubUpdateExistingReviewComment;
function githubGetSha() {
    let sha = github_1.context.sha;
    if (githubIsPullRequest()) {
        const pull = github_1.context.payload.pull_request;
        if (pull === null || pull === void 0 ? void 0 : pull.head.sha) {
            sha = pull === null || pull === void 0 ? void 0 : pull.head.sha;
        }
    }
    return sha;
}
exports.githubGetSha = githubGetSha;
function githubCreateCheck(checkName, githubToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const octokit = (0, github_1.getOctokit)(githubToken);
        const head_sha = githubGetSha();
        console.info(`Creating ${checkName}...`);
        const response = yield octokit.rest.checks.create({
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo,
            name: checkName,
            head_sha
        });
        if (response.status !== 201) {
            console.warn(`Unexpected status code recieved when creating ${checkName}: ${response.status}`);
            console.debug(JSON.stringify(response, null, 2));
        }
        else {
            console.info(`${checkName} created`);
        }
        return new interfaces_1.GitHubCheck(checkName, response.data.id, githubToken);
    });
}
exports.githubCreateCheck = githubCreateCheck;
function isIssueAllowed(securityFilters, severity, cwe, isNew = false) {
    var _a, _b;
    if (securityFilters.get("status") && isNew && ((_a = securityFilters.get("status")) === null || _a === void 0 ? void 0 : _a.indexOf("new")) >= 0) {
        return (false);
    }
    if (securityFilters.get("severity") && ((_b = securityFilters.get("severity")) === null || _b === void 0 ? void 0 : _b.indexOf(severity)) >= 0) {
        return (false);
    }
    if (securityFilters.get("cwe")) {
        const cweValues = cwe.split(', ');
        for (const cweValue of cweValues) {
            for (cwe of securityFilters.get("cwe")) {
                if (cwe == cweValue) {
                    return (false);
                }
            }
        }
    }
    return (true);
}
exports.isIssueAllowed = isIssueAllowed;
function readSecurityGateFiltersFromString(securityGateString) {
    const securityGateJson = JSON.parse(securityGateString);
    let securityGateMap = new CaseInsensitiveMap();
    console.debug(`Reading security gate filters`);
    Object.keys(securityGateJson).forEach(function (key) {
        var _a;
        var values = securityGateJson[key];
        console.debug(`  ${key}`);
        securityGateMap.set(key, new Array());
        for (const value of values) {
            (_a = securityGateMap.get(key)) === null || _a === void 0 ? void 0 : _a.push(value);
            console.debug(`    ${value}`);
        }
    });
    return (securityGateMap);
}
exports.readSecurityGateFiltersFromString = readSecurityGateFiltersFromString;
exports.POLARIS_COMMENT_PREFACE = '<!-- Comment managed by Synopsys Polaris, do not modify!';
const POLARIS_PRESENT = 'PRESENT';
function polarisCreateReviewCommentMessage(issue) {
    return `${exports.POLARIS_COMMENT_PREFACE}
${issue.key}
${POLARIS_PRESENT}
-->
# Polaris Issue - ${issue.name}
${issue.mainEventDescription} ${issue.localEffect} 
_${issue.severity} Impact, CWE ${issue.cwe} ${issue.checkerName}_
${issue.remediationEventDescription}
[View the issue in Polaris](${issue.link})
`;
}
exports.polarisCreateReviewCommentMessage = polarisCreateReviewCommentMessage;
function polarisGetBranches(polarisService, projectId) {
    return __awaiter(this, void 0, void 0, function* () {
        let complete = false;
        let offset = 0;
        let limit = 25;
        let collected_branches = Array();
        while (!complete) {
            let branch_page = yield polarisGetBranchesPage(polarisService, projectId, limit, offset);
            collected_branches = collected_branches.concat(branch_page.data);
            offset = offset + limit;
            if (offset >= branch_page.meta.total) {
                complete = true;
            }
        }
        return (collected_branches);
    });
}
exports.polarisGetBranches = polarisGetBranches;
function polarisGetBranchesPage(polarisService, projectId, limit, offset) {
    return __awaiter(this, void 0, void 0, function* () {
        let branches_path = `${polarisService.polaris_url}` +
            `/api/common/v0/branches?` +
            `page%5Blimit%5D=${limit}` +
            `&page%5Boffset%5D=${offset}` +
            `&filter%5Bbranch%5D%5Bproject%5D%5Bid%5D%5B%24eq%5D=${projectId}`;
        exports.logger.debug(`Fetch branches from: ${branches_path}`);
        const branch_data = yield polarisService.get_url(branches_path);
        exports.logger.debug(`Polaris branch data for projectId ${projectId} : ${JSON.stringify(branch_data.data, null, 2)}`);
        const branches = branch_data.data;
        return (branches);
    });
}
exports.polarisGetBranchesPage = polarisGetBranchesPage;
function polarisGetIssuesUnified(polarisService, projectId, branchId, useBranch, runId, useRun, compareBranchId, compareRunId, filterOpenOrClosed) {
    var _a, _b, _c, _d, _e, _f;
    return __awaiter(this, void 0, void 0, function* () {
        let issues = yield polarisGetIssues(polarisService, projectId, useBranch ? branchId : "", useRun ? runId : "", compareBranchId, compareRunId, filterOpenOrClosed);
        exports.logger.debug(`There are ${issues.issueData.length} issues for project: ${projectId} and run: ${runId}`);
        let issuesUnified = new Array();
        for (const issue of issues.issueData) {
            exports.logger.debug(`Issue ${issue.id} has issue key: ${(_a = issue.relationships["issue-type"]) === null || _a === void 0 ? void 0 : _a.data.id}`);
            let issueEvents = undefined;
            try {
                issueEvents = yield polarisGetIssueEventsWithSource(polarisService, issue.attributes["finding-key"], runId);
            }
            catch (error) {
                exports.logger.warn(`Unable to fetch issue events for finding key: ${issue.attributes["finding-key"]} for run: ${runId}`);
            }
            const issueTriage = yield polarisGetIssueTriage(polarisService, projectId, issue.attributes["issue-key"]);
            let issueUnified = {};
            let issue_type_id = (_b = issue.relationships["issue-type"]) === null || _b === void 0 ? void 0 : _b.data.id;
            let issue_path_id = (_c = issue.relationships.path) === null || _c === void 0 ? void 0 : _c.data.id;
            let tool_id = (_d = issue.relationships.tool) === null || _d === void 0 ? void 0 : _d.data.id;
            let issue_opened_id = (_e = issue.relationships.transitions) === null || _e === void 0 ? void 0 : _e.data[0].id;
            let issue_severity_id = (_f = issue.relationships.severity) === null || _f === void 0 ? void 0 : _f.data.id;
            issueUnified.key = issue.attributes["issue-key"];
            issueUnified.checkerName = issue.attributes["sub-tool"];
            issueUnified.dismissed = false;
            if (issueTriage) {
                let dismissStatus = yield polarisGetTriageValue("DISMISS", issueTriage.attributes["triage-current-values"]);
                if (dismissStatus && dismissStatus["display-value"] == "Dismissed") {
                    issueUnified.dismissed = true;
                }
            }
            issueUnified.path = "N/A";
            issueUnified.name = "N/A";
            issueUnified.description = "N/A";
            issueUnified.localEffect = "N/A";
            issueUnified.link = "N/A";
            issueUnified.severity = "N/A";
            for (const included_data of issues.issueIncluded) {
                if (issue_path_id && included_data.type == "path" && included_data.id == issue_path_id) {
                    issueUnified.path = included_data.attributes.path ? included_data.attributes.path.join('/') : "N/A";
                }
                if (issue_type_id && included_data.type == "issue-type" && included_data.id == issue_type_id) {
                    issueUnified.name = included_data.attributes["name"] ? included_data.attributes["name"] : "N/A";
                    issueUnified.description = included_data.attributes["description"] ? included_data.attributes["description"] : "N/A";
                    issueUnified.localEffect = included_data.attributes["local-effect"] ? included_data.attributes["local-effect"] : "N/A";
                }
                if (issue_opened_id && included_data.type == "transition" && included_data.id == issue_opened_id) {
                    issueUnified.link = `${polarisService.polaris_url}/projects/${projectId}/branches/${branchId}/revisions/` +
                        `${included_data.attributes["revision-id"]}/issues/${issue.attributes["issue-key"]}`;
                }
                if (issue_severity_id && included_data.type == "taxon" && included_data.id == issue_severity_id) {
                    issueUnified.severity = included_data.attributes.name ? included_data.attributes.name : "N/A";
                }
            }
            issueUnified.cwe = "N/A";
            if (issue.relationships["related-taxa"]) {
                issueUnified.cwe = "";
                for (const taxaData of issue.relationships["related-taxa"].data) {
                    if (issueUnified.cwe == "") {
                        issueUnified.cwe = taxaData.id;
                    }
                    else {
                        issueUnified.cwe += `, ${taxaData.id}`;
                    }
                }
            }
            issueUnified.mainEvent = "N/A";
            issueUnified.mainEventDescription = "N/A";
            issueUnified.remediationEvent = "N/A";
            issueUnified.remediationEventDescription = "N/A";
            issueUnified.line = 1;
            issueUnified.events = new Array();
            if (issueEvents) {
                issueUnified.line = issueEvents[0]["main-event-line-number"];
                for (const event of issueEvents[0].events) {
                    if (event["event-type"] == "MAIN") {
                        issueUnified.mainEvent = event["event-tag"];
                        issueUnified.mainEventDescription = event["event-description"];
                    }
                    if (event["event-tag"] == "remediation") {
                        issueUnified.remediationEvent = event["event-tag"];
                        issueUnified.remediationEventDescription = event["event-description"];
                    }
                    let issueUnifiedEvent = {};
                    issueUnifiedEvent.number = event["event-number"];
                    issueUnifiedEvent.tag = event["event-tag"];
                    issueUnifiedEvent.type = event["event-type"];
                    issueUnifiedEvent.description = event["event-description"];
                    issueUnifiedEvent["line-number"] = event["line-number"];
                    issueUnifiedEvent.filePath = event["filePath"];
                    issueUnifiedEvent["source-after"] = event["source-after"];
                    issueUnifiedEvent["source-before"] = event["source-before"];
                    issueUnified.events.push(issueUnifiedEvent);
                }
            }
            issuesUnified.push(issueUnified);
        }
        return (issuesUnified);
    });
}
exports.polarisGetIssuesUnified = polarisGetIssuesUnified;
function polarisGetTriageValue(attribute_name, triage_values) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const value of triage_values) {
            if (attribute_name == value["attribute-semantic-id"]) {
                return value;
            }
        }
        return Promise.reject();
    });
}
exports.polarisGetTriageValue = polarisGetTriageValue;
function polarisGetIssues(polarisService, projectId, branchId, runId, compareBranchId, compareRunId, filterOpenOrClosed) {
    return __awaiter(this, void 0, void 0, function* () {
        let complete = false;
        let offset = 0;
        let limit = 25;
        let collected_issues = Array();
        let collected_includes = Array();
        while (!complete) {
            let issues_page = yield getIssuesPage(polarisService, projectId, branchId, runId, compareBranchId, compareRunId, filterOpenOrClosed, limit, offset);
            collected_issues = collected_issues.concat(issues_page.data);
            collected_includes = collected_includes.concat(issues_page.included);
            offset = offset + limit;
            if (offset >= issues_page.meta.total) {
                complete = true;
            }
        }
        let issueReturn = {};
        issueReturn.issueData = collected_issues;
        issueReturn.issueIncluded = collected_includes;
        return (issueReturn);
    });
}
exports.polarisGetIssues = polarisGetIssues;
function getIssuesPage(polarisService, projectId, branchId, runId, compareBranchId, compareRunId, filterOpenOrClosed, limit, offset) {
    return __awaiter(this, void 0, void 0, function* () {
        let issues_path = `${polarisService.polaris_url}` +
            `/api/query/v1/issues?page[limit]=${limit}` +
            `&page[offset]=${offset}` +
            `&project-id=${projectId}` +
            `&include[issue][]=severity` +
            `&include[issue][]=related-taxa`;
        if (branchId.length > 0) {
            issues_path += `&branch-id=${branchId}`;
        }
        if (runId.length > 0) {
            issues_path += `&run-id=${runId}`;
        }
        if (compareRunId && compareRunId.length > 0) {
            issues_path += `&compare-run-id=${compareRunId}`;
        }
        if (compareBranchId && compareBranchId.length > 0) {
            issues_path += `&compare-branch-id=${compareBranchId}`;
        }
        if (filterOpenOrClosed && filterOpenOrClosed.length > 0) {
            //issues_path += `&filter[issue][status][$eq]=${filterOpenOrClosed}`
            issues_path += `&filter%5Bissue%5D%5Bstatus%5D%5B%24eq%5D=${filterOpenOrClosed}`;
        }
        //  // curl -X GET "https://sipse.polaris.synopsys.com/api/query/v1/issues?p
        //  roject-id=f435f59c-5abb-4957-a725-28d93f0e645b
        //  &branch-id=c7b567ee-39ae-4ca2-8d56-7496d29f32d8
        //  &compare-branch-id=94f11f15-2892-4496-9245-b53b6d25ca10
        //  &filter%5Bissue%5D%5Bstatus%5D%5B%24eq%5D=closed
        //  &page%5Blimit%5D=50" -H "accept: application/vnd.api+json"
        exports.logger.debug(`Fetch issues from: ${issues_path}`);
        const issues_data = yield polarisService.get_url(issues_path);
        //logger.debug(`Polaris runs data for projectId ${projectId} and branchId ${branchId} ${JSON.stringify(issues_data.data, null, 2)}`)
        const issues = issues_data.data;
        return (issues);
    });
}
exports.getIssuesPage = getIssuesPage;
function polarisGetIssueEventsWithSource(polarisService, findingKey, runId) {
    return __awaiter(this, void 0, void 0, function* () {
        let events_with_source_path = `${polarisService.polaris_url}` +
            `/api/code-analysis/v0/events-with-source?finding-key=${findingKey}` +
            `&run-id=${runId}` +
            `&occurrence-number=1` +
            `&max-depth=10`;
        exports.logger.debug(`Fetch issue events with source from: ${events_with_source_path}`);
        const events_with_source_data = yield polarisService.get_url(events_with_source_path);
        exports.logger.debug(`Polaris events with source data for findingKey ${findingKey} and runId ${runId}: ${JSON.stringify(events_with_source_data.data, null, 2)}`);
        const events = events_with_source_data.data;
        return (events.data);
    });
}
exports.polarisGetIssueEventsWithSource = polarisGetIssueEventsWithSource;
function polarisGetIssueTriage(polarisService, projectId, issueKey) {
    return __awaiter(this, void 0, void 0, function* () {
        let triage_path = `${polarisService.polaris_url}` +
            `/api/triage-query/v1/triage-current/project-id%3A${projectId}` +
            `%3Aissue-key%3A${issueKey}`;
        exports.logger.debug(`Fetch issue triage from: ${triage_path}`);
        const triage_data = yield polarisService.get_url(triage_path);
        //logger.debug(`Polaris triage data for projectId ${projectId} and issueKey ${issueKey} ${JSON.stringify(triage_data.data, null, 2)}`)
        const triage = triage_data.data;
        return (triage.data);
    });
}
exports.polarisGetIssueTriage = polarisGetIssueTriage;
function polarisGetRuns(polarisService, projectId, branchId) {
    return __awaiter(this, void 0, void 0, function* () {
        let complete = false;
        let offset = 0;
        let limit = 25;
        let collected_runs = Array();
        while (!complete) {
            let run_page = yield polarisGetRunsPage(polarisService, projectId, branchId, limit, offset);
            collected_runs = collected_runs.concat(run_page.data);
            offset = offset + limit;
            if (offset >= run_page.meta.total) {
                complete = true;
            }
        }
        return (collected_runs);
    });
}
exports.polarisGetRuns = polarisGetRuns;
function polarisGetRunsPage(polarisService, projectId, branchId, limit, offset) {
    return __awaiter(this, void 0, void 0, function* () {
        let runs_path = `${polarisService.polaris_url}` +
            `/api/common/v0/runs?page[limit]=${limit}` +
            `&page[offset]=${offset}` +
            `&filter[run][project][id][eq]=${projectId}` +
            `&filter[run][revision][branch][id][eq]=${branchId}`;
        exports.logger.debug(`Fetch runs from: ${runs_path}`);
        const run_data = yield polarisService.get_url(runs_path);
        //logger.debug(`Polaris runs data for projectId ${projectId} and branchId ${branchId}: ${JSON.stringify(run_data.data, null, 2)}`)
        const runs = run_data.data;
        return (runs);
    });
}
exports.polarisGetRunsPage = polarisGetRunsPage;
function polarisIsInDiff(issue, diffMap) {
    const diffHunks = diffMap.get(issue.path);
    if (!diffHunks) {
        return false;
    }
    return diffHunks.filter(hunk => hunk.firstLine <= issue.line).some(hunk => issue.line <= hunk.lastLine);
}
exports.polarisIsInDiff = polarisIsInDiff;
