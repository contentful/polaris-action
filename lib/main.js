"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubGetChangesForPR = void 0;
// import fs from 'fs'
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const path = __importStar(require("path"));
const exec = __importStar(require("@actions/exec"));
const core_1 = require("@actions/core");
const utils_1 = require("./utils");
const classes_1 = require("./classes");
const inputs_1 = require("./inputs");
const github_1 = require("@actions/github");
const core = __importStar(require("@actions/core"));
const rest_1 = require("@octokit/rest");
const application_constants_1 = require("./application-constants");
const installer = __importStar(require("./installer"));
function githubGetChangesForPR(github_token) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        let changed_files = new Array();
        const octokit = new rest_1.Octokit({ auth: github_token });
        let base = (_b = (_a = github_1.context.payload.pull_request) === null || _a === void 0 ? void 0 : _a.base) === null || _b === void 0 ? void 0 : _b.sha;
        let head = (_d = (_c = github_1.context.payload.pull_request) === null || _c === void 0 ? void 0 : _c.head) === null || _d === void 0 ? void 0 : _d.sha;
        utils_1.logger.debug(`Get changes for Pull Request based on base commit: ${base} and head commit: ${head}`);
        const response = yield octokit.repos.compareCommits({
            base,
            head,
            owner: github_1.context.repo.owner,
            repo: github_1.context.repo.repo
        });
        if (response.status !== 200) {
            utils_1.logger.error(`The GitHub API for comparing the base and head commits for this ${github_1.context.eventName} event returned ${response.status}, expected 200.`);
            return (changed_files);
        }
        const files = response.data.files;
        if (files) {
            for (const file of files) {
                switch (file.status) {
                    case 'added':
                        utils_1.logger.debug(`Change set added file: ${file.filename}`);
                        changed_files.push(file.filename);
                        break;
                    case 'modified':
                        utils_1.logger.debug(`Change set modified file: ${file.filename}`);
                        changed_files.push(file.filename);
                        break;
                    case 'renamed':
                        utils_1.logger.debug(`Change set renamed file: ${file.filename}`);
                        changed_files.push(file.filename);
                        break;
                }
            }
        }
        return (changed_files);
    });
}
exports.githubGetChangesForPR = githubGetChangesForPR;
function run() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return __awaiter(this, void 0, void 0, function* () {
        utils_1.logger.info('Starting Coverity GitHub Action');
        const polarisPolicyCheck = yield (0, utils_1.githubCreateCheck)(application_constants_1.CHECK_NAME, inputs_1.GITHUB_TOKEN);
        const runnerTmpdir = process.env["RUNNER_TEMP"] || os_1.default.tmpdir();
        const tmpdir = yield fs_1.promises.mkdtemp(path.join(runnerTmpdir, "reviewdog-"));
        const reviewdog = yield core.group("🐶 Installing reviewdog ... https://github.com/reviewdog/reviewdog", () => __awaiter(this, void 0, void 0, function* () {
            return yield installer.installReviewdog("latest", tmpdir);
        }));
        try {
            if (inputs_1.DEBUG) {
                utils_1.logger.level = 'debug';
                utils_1.logger.debug(`Enabled debug mode`);
            }
            utils_1.logger.info(`Connecting to Polaris service at: ${inputs_1.POLARIS_URL}`);
            var timerDate = new Date(1574460000000);
            utils_1.logger.debug(`Date=${timerDate}`);
            let securityGateFilters = undefined;
            if (inputs_1.SECURITY_GATE_FILTERS) {
                try {
                    securityGateFilters = (0, utils_1.readSecurityGateFiltersFromString)(inputs_1.SECURITY_GATE_FILTERS);
                }
                catch (error) {
                    utils_1.logger.error(`Unable to parse security gate filters: ${error}`);
                    polarisPolicyCheck.cancelCheck();
                    process.exit(2);
                }
            }
            utils_1.logger.debug(`Security gate filter: ${securityGateFilters}`);
            // let isIncremental = POLARIS_COMMAND.includes("--incremental")
            let isIncremental = false;
            (0, utils_1.githubIsPullRequest)() ? isIncremental = true : false;
            const task_input = new classes_1.PolarisInputReader().getPolarisInputs(inputs_1.POLARIS_URL, inputs_1.POLARIS_ACCESS_TOKEN, inputs_1.POLARIS_PROXY_URL ? inputs_1.POLARIS_PROXY_URL : "", inputs_1.POLARIS_PROXY_USERNAME ? inputs_1.POLARIS_PROXY_USERNAME : "", inputs_1.POLARIS_PROXY_PASSWORD ? inputs_1.POLARIS_PROXY_PASSWORD : "", inputs_1.POLARIS_COMMAND, !isIncremental, isIncremental, false);
            const connection = task_input.polaris_connection;
            var polaris_install_path;
            polaris_install_path = os_1.default.tmpdir();
            if (!polaris_install_path) {
                utils_1.logger.warn("Agent did not have a tool directory, polaris will be installed to the current working directory.");
                polaris_install_path = process.cwd();
            }
            utils_1.logger.info(`Polaris Software Integrity Platform will be installed to the following path: ` + polaris_install_path);
            utils_1.logger.info("Connecting to Polaris Software Integrity Platform server.");
            const polaris_service = new classes_1.PolarisService(utils_1.logger, connection);
            yield polaris_service.authenticate();
            utils_1.logger.debug("Authenticated with polaris.");
            // In the future it would be nice to supoprt phone home for stats
            try {
                utils_1.logger.debug("Fetching organization name and task version.");
                const org_name = yield polaris_service.fetch_organization_name();
                utils_1.logger.debug(`Organization name: ${org_name}`);
                /*
                const task_version = PhoneHomeService.FindTaskVersion();
          
                logger.debug("Starting phone home.");
                const phone_home_service = PhoneHomeService.CreateClient(log);
                await phone_home_service.phone_home(connection.url, task_version, org_name);
                logger.debug("Phoned home.");
                 */
            }
            catch (e) {
                /*
                logger.debug("Unable to phone home.");
                 */
            }
            let polaris_run_result = undefined;
            if (inputs_1.SKIP_RUN) {
                polaris_run_result = {
                    scan_cli_json_path: ".synopsys/polaris/cli-scan.json",
                    return_code: 0
                };
            }
            else {
                //If there are no changes, we can potentially bail early, so we do that first.
                // TODO: This may need some tweaks
                process.env.GIT_BRANCH = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
                var actual_build_command = `${inputs_1.POLARIS_COMMAND}`;
                if ((0, utils_1.githubIsPullRequest)() && task_input.should_populate_changeset) {
                    utils_1.logger.debug("Populating change set for Polaris Software Integrity Platform.");
                    const changed_files = yield githubGetChangesForPR(inputs_1.GITHUB_TOKEN);
                    for (const file in changed_files) {
                        utils_1.logger.debug(`Found changed file: ${file}`);
                    }
                    if (changed_files.length == 0 && task_input.should_empty_changeset_fail) {
                        utils_1.logger.error(` Task failed: No changed files were found.`);
                        polarisPolicyCheck.cancelCheck();
                        return;
                    }
                    else if (changed_files.length == 0) {
                        utils_1.logger.info("Task finished: No changed files were found.");
                        polarisPolicyCheck.cancelCheck();
                        return;
                    }
                    const change_set_environment = new classes_1.ChangeSetEnvironment(utils_1.logger, process.env);
                    const change_file = change_set_environment.get_or_create_file_path(process.cwd());
                    change_set_environment.set_enable_incremental();
                    yield new classes_1.ChangeSetFileWriter(utils_1.logger).write_change_set_file(change_file, changed_files);
                    actual_build_command += " --incremental";
                    actual_build_command = new classes_1.ChangeSetReplacement().replace_build_command(actual_build_command, change_file);
                }
                utils_1.logger.info("Installing Polaris Software Integrity Platform.");
                var polaris_installer = classes_1.PolarisInstaller.default_installer(utils_1.logger, polaris_service);
                var polaris_install = yield polaris_installer.install_or_locate_polaris(connection.url, polaris_install_path);
                utils_1.logger.info("Found Polaris Software Integrity Platform: " + polaris_install.polaris_executable);
                utils_1.logger.info("Running Polaris Software Integrity Platform.");
                var polaris_runner = new classes_1.PolarisRunner(utils_1.logger);
                polaris_run_result = yield polaris_runner.execute_cli(connection, polaris_install, process.cwd(), actual_build_command);
                if (task_input.should_wait_for_issues) {
                    utils_1.logger.info("Checking for issues.");
                    var polaris_waiter = new classes_1.PolarisIssueWaiter(utils_1.logger);
                    var issue_count = yield polaris_waiter.wait_for_issues(polaris_run_result.scan_cli_json_path, polaris_service);
                    // Ignore, we will calculate issues separately
                    // logger.error(`Polaris Software Integrity Platform found ${issue_count} total issues.`)
                }
                else {
                    utils_1.logger.info("Will not check for issues.");
                }
            }
            if (!polaris_run_result) {
                utils_1.logger.error(`Unable to find Polaris run results.`);
                polarisPolicyCheck.cancelCheck();
                process.exit(2);
            }
            let issuesUnified = undefined;
            if (isIncremental) {
                const resultsGlobber = require('fast-glob');
                const resultsJson = yield resultsGlobber([`.synopsys/polaris/data/coverity/*/idir/incremental-results/incremental-results.json`]);
                utils_1.logger.debug(`Incremental results in ${resultsJson[0]}`);
                const newResultsJson = yield resultsGlobber([`.synopsys/polaris/data/coverity/*/idir/incremental-results/new-issues.json`]);
                const newResultsContent = yield fs_1.promises.readFile(newResultsJson[0]);
                const newResults = JSON.parse(newResultsContent.toString());
                // TODO validate file exists and is .json?
                const jsonV7Content = yield fs_1.promises.readFile(resultsJson[0]);
                const coverityIssues = JSON.parse(jsonV7Content.toString());
                issuesUnified = new Array();
                for (const issue of coverityIssues.issues) {
                    for (const newResult of newResults) {
                        if (issue.mergeKey == newResult.mergeKey) {
                            let issueUnified = {};
                            issueUnified.key = issue.mergeKey;
                            issueUnified.name = issue.subcategory;
                            if ((_a = issue.checkerProperties) === null || _a === void 0 ? void 0 : _a.subcategoryLongDescription) {
                                issueUnified.description = (_b = issue.checkerProperties) === null || _b === void 0 ? void 0 : _b.subcategoryLongDescription;
                            }
                            else {
                                issueUnified.description = issue.subcategory;
                            }
                            if ((_c = issue.checkerProperties) === null || _c === void 0 ? void 0 : _c.subcategoryLocalEffect) {
                                issueUnified.localEffect = (_d = issue.checkerProperties) === null || _d === void 0 ? void 0 : _d.subcategoryLocalEffect;
                            }
                            else {
                                issueUnified.localEffect = "(Local effect not available)";
                            }
                            issueUnified.checkerName = issue.checkerName;
                            issueUnified.path = issue.strippedMainEventFilePathname;
                            issueUnified.line = issue.mainEventLineNumber;
                            if ((_e = issue.checkerProperties) === null || _e === void 0 ? void 0 : _e.impact) {
                                issueUnified.severity = (_f = issue.checkerProperties) === null || _f === void 0 ? void 0 : _f.impact;
                            }
                            else {
                                issueUnified.severity = "(Unknown impact)";
                            }
                            if ((_g = issue.checkerProperties) === null || _g === void 0 ? void 0 : _g.cweCategory) {
                                issueUnified.cwe = (_h = issue.checkerProperties) === null || _h === void 0 ? void 0 : _h.cweCategory;
                            }
                            else {
                                issueUnified.cwe = "(No CWE)";
                            }
                            issueUnified.mainEvent = "";
                            issueUnified.mainEventDescription = "(Main event description not available)";
                            issueUnified.remediationEvent = "";
                            issueUnified.remediationEventDescription = "";
                            for (const event of issue.events) {
                                if (event.main) {
                                    issueUnified.mainEvent = event.eventTag;
                                    issueUnified.mainEventDescription = event.eventDescription;
                                }
                                if (event.eventTag == "remediation") {
                                    issueUnified.remediationEvent = event.eventTag;
                                    issueUnified.remediationEventDescription = event.eventDescription;
                                }
                            }
                            issueUnified.dismissed = false;
                            issueUnified.events = [];
                            issueUnified.link = "N/A"; // TODO: Fix this up
                            issuesUnified.push(issueUnified);
                            break;
                        }
                    }
                }
            }
            else {
                var scan_json_text = fs_1.promises.readFile(polaris_run_result.scan_cli_json_path);
                var scan_json = JSON.parse(scan_json_text.toString());
                const json_path = require('jsonpath');
                var project_id = json_path.query(scan_json, "$.projectInfo.projectId");
                var branch_id = json_path.query(scan_json, "$.projectInfo.branchId");
                var revision_id = json_path.query(scan_json, "$.projectInfo.revisionId");
                utils_1.logger.debug(`Connect to Polaris: ${polaris_service.polaris_url} and fetch issues for project: ${project_id} and branch: ${branch_id}`);
                let runs = yield (0, utils_1.polarisGetRuns)(polaris_service, project_id, branch_id);
                if (runs.length > 1) {
                    utils_1.logger.debug(`Most recent run is: ${runs[0].id} was created on ${runs[0].attributes["creation-date"]}`);
                    utils_1.logger.debug(`Last run is: ${runs[1].id} was created on ${runs[1].attributes["creation-date"]}`);
                    utils_1.logger.debug(`...`);
                }
                let branches = yield (0, utils_1.polarisGetBranches)(polaris_service, project_id);
                if ((0, utils_1.githubIsPullRequest)()) {
                    let merge_target_branch = process.env["GITHUB_BASE_REF"];
                    if (!merge_target_branch) {
                        utils_1.logger.error(`Running on a pull request and cannot find GitHub environment variable GITHUB_BASE_REF`);
                        polarisPolicyCheck.cancelCheck();
                        process.exit(2);
                    }
                    let branches = yield (0, utils_1.polarisGetBranches)(polaris_service, project_id);
                    let branch_id_compare = undefined;
                    for (const branch of branches) {
                        if (branch.attributes.name == merge_target_branch) {
                            utils_1.logger.debug(`Running on pull request, and target branch is '${merge_target_branch}' which has Polaris ID ${branch.id}`);
                            branch_id_compare = branch.id;
                        }
                    }
                    if (!branch_id_compare) {
                        utils_1.logger.error(`Running on pull request and unable to find previous Polaris analysis for merge target: ${merge_target_branch}, will fall back to full results`);
                    }
                    else {
                        issuesUnified = yield (0, utils_1.polarisGetIssuesUnified)(polaris_service, project_id, branch_id, true, runs[0].id, false, branch_id_compare, "", "opened");
                    }
                }
                if (!issuesUnified) {
                    utils_1.logger.debug(`No pull request or merge comparison available, fetching full results`);
                    issuesUnified = yield (0, utils_1.polarisGetIssuesUnified)(polaris_service, project_id, branch_id, true, runs[0].id, false, "", "", "");
                }
            }
            utils_1.logger.info("Executed Polaris Software Integrity Platform: " + polaris_run_result.return_code);
            // TODO If SARIF
            if ((0, utils_1.githubIsPullRequest)()) {
                const newReviewComments = [];
                const actionReviewComments = yield (0, utils_1.githubGetExistingReviewComments)(inputs_1.GITHUB_TOKEN).then(comments => comments.filter(comment => comment.body.includes(utils_1.POLARIS_COMMENT_PREFACE)));
                const actionIssueComments = yield (0, utils_1.githubGetExistingIssueComments)(inputs_1.GITHUB_TOKEN).then(comments => comments.filter(comment => { var _a; return (_a = comment.body) === null || _a === void 0 ? void 0 : _a.includes(utils_1.POLARIS_COMMENT_PREFACE); }));
                const diffMap = yield (0, utils_1.githubGetPullRequestDiff)(inputs_1.GITHUB_TOKEN).then(utils_1.githubGetDiffMap);
                for (const issue of issuesUnified) {
                    utils_1.logger.info(`Found Polaris Issue ${issue.key} at ${issue.path}:${issue.line}`);
                    let ignoredOnServer = issue.dismissed;
                    const reviewCommentBody = (0, utils_1.polarisCreateReviewCommentMessage)(issue);
                    const issueCommentBody = (0, utils_1.polarisCreateReviewCommentMessage)(issue);
                    const cwd = path.relative(process.env["GITHUB_WORKSPACE"] || process.cwd(), ".");
                    process.env["REVIEWDOG_GITHUB_API_TOKEN"] = core.getInput("github_token");
                    yield exec.exec(reviewdog, [
                        "-f=polaris",
                        `-name=polaris`,
                        `-reporter=github-pr-review`,
                        `-filter-mode=added`,
                        `-fail-on-error=true`,
                        `-level=error`,
                    ], {
                        cwd,
                        input: Buffer.from(reviewCommentBody, "utf-8"),
                        ignoreReturnCode: true,
                    });
                    const reviewCommentIndex = actionReviewComments.findIndex(comment => comment.line === issue.line &&
                        comment.body.includes(issue.key));
                    let existingMatchingReviewComment = undefined;
                    if (reviewCommentIndex !== -1) {
                        existingMatchingReviewComment = actionReviewComments.splice(reviewCommentIndex, 1)[0];
                    }
                    const issueCommentIndex = actionIssueComments.findIndex(comment => { var _a; return (_a = comment.body) === null || _a === void 0 ? void 0 : _a.includes(issue.key); });
                    let existingMatchingIssueComment = undefined;
                    if (issueCommentIndex !== -1) {
                        existingMatchingIssueComment = actionIssueComments.splice(issueCommentIndex, 1)[0];
                    }
                    if (existingMatchingReviewComment !== undefined) {
                        utils_1.logger.info(`Issue already reported in comment ${existingMatchingReviewComment.id}, updating if necessary...`);
                        if (existingMatchingReviewComment.body !== reviewCommentBody) {
                            (0, utils_1.githubUpdateExistingReviewComment)(inputs_1.GITHUB_TOKEN, existingMatchingReviewComment.id, reviewCommentBody);
                        }
                    }
                    else if (existingMatchingIssueComment !== undefined) {
                        utils_1.logger.info(`Issue already reported in comment ${existingMatchingIssueComment.id}, updating if necessary...`);
                        if (existingMatchingIssueComment.body !== issueCommentBody) {
                            (0, utils_1.githubUpdateExistingIssueComment)(inputs_1.GITHUB_TOKEN, existingMatchingIssueComment.id, issueCommentBody);
                        }
                    }
                    else if (ignoredOnServer) {
                        utils_1.logger.info('Issue ignored on server, no comment needed.');
                    }
                    else if ((0, utils_1.polarisIsInDiff)(issue, diffMap)) {
                        utils_1.logger.info('Issue not reported, adding a comment to the review.');
                        newReviewComments.push(createReviewComment(issue, reviewCommentBody));
                    }
                    else {
                        utils_1.logger.info('Issue not reported, adding an issue comment.');
                        (0, utils_1.githubCreateIssueComment)(inputs_1.GITHUB_TOKEN, issueCommentBody);
                    }
                }
                for (const comment of actionReviewComments) {
                    if ((0, utils_1.coverityIsPresent)(comment.body)) {
                        (0, core_1.info)(`Comment ${comment.id} represents a Coverity issue which is no longer present, updating comment to reflect resolution.`);
                        (0, utils_1.githubUpdateExistingReviewComment)(inputs_1.GITHUB_TOKEN, comment.id, (0, utils_1.coverityCreateNoLongerPresentMessage)(comment.body));
                    }
                }
                for (const comment of actionIssueComments) {
                    if (comment.body !== undefined && (0, utils_1.coverityIsPresent)(comment.body)) {
                        (0, core_1.info)(`Comment ${comment.id} represents a Coverity issue which is no longer present, updating comment to reflect resolution.`);
                        (0, utils_1.githubUpdateExistingReviewComment)(inputs_1.GITHUB_TOKEN, comment.id, (0, utils_1.coverityCreateNoLongerPresentMessage)(comment.body));
                    }
                }
                if (newReviewComments.length > 0) {
                    (0, core_1.info)('Publishing review...');
                    (0, utils_1.githubCreateReview)(inputs_1.GITHUB_TOKEN, newReviewComments);
                }
            }
            utils_1.logger.info(`Found ${issuesUnified.length} Reported Polaris issues.`);
            let security_gate_pass = true;
            if (securityGateFilters) {
                utils_1.logger.debug(`Checking security gate...`);
                for (const issue of issuesUnified) {
                    utils_1.logger.debug(`Test issue ${issue.key} severity: ${issue.severity} cwe: ${issue.cwe}`);
                    if (!(0, utils_1.isIssueAllowed)(securityGateFilters, issue.severity, issue.cwe, (0, utils_1.githubIsPullRequest)() ? true : false)) {
                        utils_1.logger.debug(`Issue ${issue.key} does not pass security gate filters`);
                        security_gate_pass = false;
                        break;
                    }
                }
            }
            if (!security_gate_pass) {
                utils_1.logger.error(`Security gate failure, setting status check to failure`);
                polarisPolicyCheck.failCheck('Issues found that violate your security gate filters', '');
            }
            else {
                polarisPolicyCheck.passCheck('No issues violated your security gate filters', '');
            }
        }
        catch (unhandledError) {
            utils_1.logger.debug('Canceling policy check because of an unhandled error.');
            polarisPolicyCheck.cancelCheck();
            utils_1.logger.error(`Failed due to an unhandled error: '${unhandledError}'`);
        }
    });
}
function isInDiff(issue, diffMap) {
    const diffHunks = diffMap.get(issue.mainEventFilePathname);
    if (!diffHunks) {
        return false;
    }
    return diffHunks.filter(hunk => hunk.firstLine <= issue.mainEventLineNumber).some(hunk => issue.mainEventLineNumber <= hunk.lastLine);
}
function createReviewComment(issue, commentBody) {
    return {
        path: issue.path,
        body: commentBody,
        line: issue.line,
        side: 'RIGHT'
    };
}
run();
