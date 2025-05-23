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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolarisJobService = exports.PolarisIssueWaiter = exports.PolarisRunResult = exports.PolarisRunner = exports.PolarisInstaller = exports.PolarisInstall = exports.PolarisPlatformSupport = exports.ChangeSetReplacement = exports.ChangeSetFileWriter = exports.ChangeSetEnvironment = exports.PolarisService = exports.PolarisInputReader = exports.PolarisConnection = void 0;
const url = require('url');
const Axios = require('axios');
const moment = require("moment");
const CancelToken = Axios.CancelToken;
const fs = require('fs');
const json_path = require('jsonpath');
const debug = require('debug');
const path = require('path');
const fse = require('fs-extra');
const utils_1 = require("./utils");
const os = __importStar(require("os"));
const zipper = require('adm-zip');
const urlParser = require('url');
const exec_1 = require("@actions/exec");
class PolarisConnection {
    constructor(url, token) {
        this.url = url;
        this.token = token;
    }
}
exports.PolarisConnection = PolarisConnection;
class PolarisInputReader {
    getPolarisInputs(polaris_url, polaris_token, build_command, should_wait_for_issues, should_changeset, should_changeset_fail) {
        if (polaris_url.endsWith("/") || polaris_url.endsWith("\\")) {
            polaris_url = polaris_url.slice(0, -1);
        }
        if (build_command.includes("--incremental")) {
            should_changeset = true;
        }
        return {
            polaris_connection: new PolarisConnection(polaris_url, polaris_token),
            build_command: build_command,
            should_wait_for_issues: should_wait_for_issues,
            should_empty_changeset_fail: should_changeset_fail,
            should_populate_changeset: should_changeset
        };
    }
}
exports.PolarisInputReader = PolarisInputReader;
class PolarisService {
    constructor(log, connection) {
        if (connection.url.endsWith("/") || connection.url.endsWith("\\")) {
            this.polaris_url = connection.url.slice(0, -1);
        }
        else {
            this.polaris_url = connection.url;
        }
        this.access_token = connection.token;
        this.bearer_token = null;
        this.headers = null;
        this.log = log;
        this.axios = Axios.create();
    }
    authenticate() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.info("Authenticating with Polaris Software Integrity Platform.");
            this.bearer_token = yield this.fetch_bearer_token();
            debug.disable();
            this.headers = {
                Authorization: `Bearer ${this.bearer_token}`
            };
        });
    }
    get_job(job_status_url) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.axios.get(job_status_url, {
                headers: this.headers
            });
        });
    }
    fetch_bearer_token() {
        const resultPromise = new Promise((resolve, reject) => {
            const timeout = 10000;
            setTimeout(() => { reject(new Error(`Failed to authenticate with Polaris Software Integrity Platform. This may be a problem with your url, proxy setup or network.`)); }, timeout);
            var authenticateUrl = this.polaris_url + "/api/auth/authenticate";
            try {
                this.axios.post(authenticateUrl, "accesstoken=" + this.access_token, { timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then((authResponse) => {
                    if (authResponse.data.jwt) {
                        this.log.info("Succesfully authenticated, saving bearer token.");
                        resolve(authResponse.data.jwt);
                    }
                    else {
                        this.log.error(`Failed to authenticate with Polaris Software Integrity Platform, no bearer token received.`);
                        reject(new Error(`Failed to authenticate with Polaris Software Integrity Platform. Status: ${authResponse.status} Reason: ${authResponse.statusText}`));
                    }
                }).catch((e) => {
                    this.log.error(`Unable to authenticate with Polaris Software Integrity Platform at url: ${authenticateUrl}`);
                    this.log.error(`This may be a problem with your Polaris Software Integrity Platform url, proxy setup or network.`);
                    reject(e);
                });
            }
            catch (e) {
                this.log.error(`Unable to authenticate with Polaris Software Integrity Platform at url: ${authenticateUrl}`);
                this.log.error(`This may be a problem with your Polaris Software Integrity Platform url, proxy setup or network.`);
                reject(e);
            }
        });
        return resultPromise;
    }
    fetch_cli_modified_date(url) {
        return __awaiter(this, void 0, void 0, function* () {
            var token = CancelToken.source();
            var self = this;
            self.log.debug("Fetching cli modified date from: " + url);
            return new Promise((resolve, reject) => {
                this.axios({
                    url: url,
                    method: 'GET',
                    responseType: 'stream',
                    cancelToken: token.token
                }).then(function (response) {
                    var lastModifiedText = response.headers['last-modified'];
                    self.log.debug("Last Modified Header: " + lastModifiedText);
                    var lastModifiedDate = moment(lastModifiedText);
                    self.log.debug("Last Modified Date: " + lastModifiedDate.format());
                    token.cancel();
                    resolve(lastModifiedDate);
                }).catch(function (error) {
                    reject(error);
                });
            });
        });
    }
    fetch_issue_data(url) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.axios.get(url, {
                headers: this.headers
            });
        });
    }
    get_url(url) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.axios.get(url, {
                headers: this.headers
            });
        });
    }
    fetch_organization_name() {
        return __awaiter(this, void 0, void 0, function* () {
            var target = this.polaris_url + "/api/auth/contexts";
            var result = yield this.axios({
                url: target,
                method: 'GET',
                responseType: 'json',
                headers: this.headers,
            });
            var organization_names = json_path.query(result.data, "$.data[*].attributes.organizationname");
            if (organization_names.length > 0) {
                return organization_names[0];
            }
            else {
                return null;
            }
        });
    }
    download_cli(url, file) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug("Downloading cli from: " + url);
            this.log.debug("Downloading cli to: " + file);
            const writer = fs.createWriteStream(file);
            const response = yield this.axios({
                url,
                method: 'GET',
                responseType: 'stream'
            });
            response.data.pipe(writer);
            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        });
    }
}
exports.PolarisService = PolarisService;
class ChangeSetEnvironment {
    constructor(log, env) {
        this.log = log;
        this.env = env;
    }
    set_enable_incremental() {
        this.env["POLARIS_FF_ENABLE_COVERITY_INCREMENTAL"] = "true";
    }
    is_file_path_present() {
        if ("CHANGE_SET_FILE_PATH" in this.env) {
            return true;
        }
        else {
            return false;
        }
    }
    set_default_file_path(cwd) {
        this.env["CHANGE_SET_FILE_PATH"] = path.join(cwd, ".blackduck", "polaris", "changeSetFile.txt");
    }
    get_file_path() {
        return this.env["CHANGE_SET_FILE_PATH"];
    }
    get_or_create_file_path(cwd) {
        if (this.is_file_path_present()) {
            return this.get_file_path();
        }
        else {
            this.set_default_file_path(cwd);
            return this.get_file_path();
        }
    }
}
exports.ChangeSetEnvironment = ChangeSetEnvironment;
class ChangeSetFileWriter {
    constructor(log) {
        this.log = log;
    }
    write_change_set_file(file, paths) {
        return __awaiter(this, void 0, void 0, function* () {
            yield fse.ensureFile(file);
            return new Promise((resolve, reject) => {
                var content = paths.join("\n");
                fs.writeFile(file, content, (err) => {
                    if (err) {
                        utils_1.logger.error("Writing change set file failed: " + err);
                        return reject(err);
                    }
                    else {
                        utils_1.logger.info("Created change set file: " + file);
                        return resolve(0);
                    }
                });
            });
        });
    }
}
exports.ChangeSetFileWriter = ChangeSetFileWriter;
class ChangeSetReplacement {
    replace_build_command(build_command, path) {
        return build_command.split("$CHANGE_SET_FILE_PATH").join(path);
    }
}
exports.ChangeSetReplacement = ChangeSetReplacement;
class PolarisExecutableFinder {
    constructor(log, platformSupport) {
        this.log = log;
        this.platformSupport = platformSupport;
    }
    find_executable(polaris_install) {
        return __awaiter(this, void 0, void 0, function* () {
            var polarisInternalFolders = fs.readdirSync(polaris_install);
            var polarisFolder = path.join(polaris_install, polarisInternalFolders[0]);
            var bin = path.join(polarisFolder, "bin");
            var exes = fs.readdirSync(bin);
            for (var i in exes) {
                var file = exes[i];
                yield this.ensure_executable(path.join(bin, file));
            }
            var polaris_exe = this.platformSupport.platform_specific_executable_name("polaris");
            return path.join(bin, polaris_exe);
        });
    }
    ensure_executable(exe) {
        return __awaiter(this, void 0, void 0, function* () {
            if (fs.existsSync(exe)) {
                this.log.debug(`Ensuring ${exe} is executable.`);
                fs.chmodSync(exe, 0o775);
                return exe;
            }
            else {
                throw new Error(`Could not make ${exe} executable.`);
            }
        });
    }
}
exports.default = PolarisExecutableFinder;
class PolarisPlatformSupport {
    platform_specific_cli_zip_url_fragment(client) {
        var platform = os.platform();
        if (platform == "win32") {
            return "/api/tools/" + client + "_cli-win64.zip";
        }
        else if (platform == "darwin") {
            return "/api/tools/" + client + "_cli-macosx.zip";
        }
        else {
            return "/api/tools/" + client + "_cli-linux64.zip";
        }
    }
    platform_specific_executable_name(client) {
        var platform = os.platform();
        if (platform == "win32") {
            return client + ".exe";
        }
        else {
            return client;
        }
    }
}
exports.PolarisPlatformSupport = PolarisPlatformSupport;
class PolarisInstall {
    constructor(polaris_executable, polaris_home) {
        this.polaris_executable = polaris_executable;
        this.polaris_home = polaris_home;
    }
}
exports.PolarisInstall = PolarisInstall;
class PolarisInstaller {
    static default_installer(log, polaris_service) {
        const platform_support = new PolarisPlatformSupport();
        const executable_finder = new PolarisExecutableFinder(log, platform_support);
        return new PolarisInstaller(log, executable_finder, platform_support, polaris_service);
    }
    constructor(log, executable_finder, platform_support, polaris_service) {
        this.log = log;
        this.executable_finder = executable_finder;
        this.platform_support = platform_support;
        this.polaris_service = polaris_service;
    }
    install_or_locate_polaris(polaris_url) {
        return __awaiter(this, void 0, void 0, function* () {
            var polaris_exe = "polaris";
            var polaris_home = "polaris";
            return new PolarisInstall(polaris_exe, polaris_home);
        });
    }
}
exports.PolarisInstaller = PolarisInstaller;
class PolarisRunner {
    constructor(log) {
        this.log = log;
    }
    execute_cli(connection, polaris_install, cwd, build_command) {
        return __awaiter(this, void 0, void 0, function* () {
            var env = process.env;
            env["POLARIS_SERVER_URL"] = connection.url;
            env["POLARIS_ACCESS_TOKEN"] = connection.token;
            if ("POLARIS_HOME" in env) {
                this.log.info("A POLARIS_HOME exists, will not attempt to override.");
            }
            else {
                var override_home = polaris_install.polaris_home;
                if (!fs.existsSync(override_home)) {
                    this.log.info("Creating plugin Polaris home: " + override_home);
                    fse.ensureDirSync(override_home);
                }
                else {
                    this.log.debug("Polaris home already exists, it will not be created.");
                }
                if (fs.existsSync(override_home)) {
                    this.log.info("Set POLARIS_HOME to directory: " + override_home);
                    env["POLARIS_HOME"] = override_home;
                }
                else {
                    this.log.error("Unable to create a POLARIS_HOME and env variable was not set. Will not override. Try creating POLARIS_HOME on the agent or ensuring agent has access.");
                }
            }
            utils_1.logger.info(`Executing ${polaris_install.polaris_executable} with line=${build_command}`);
            var return_code = yield (0, exec_1.exec)(polaris_install.polaris_executable, build_command.split(' '), { ignoreReturnCode: true });
            var synopsysFolder = path.join(cwd, ".blackduck");
            var polarisFolder = path.join(synopsysFolder, "polaris");
            var scanJsonFile = path.join(polarisFolder, "cli-scan.json");
            return new PolarisRunResult(return_code, scanJsonFile);
        });
    }
}
exports.PolarisRunner = PolarisRunner;
class PolarisRunResult {
    constructor(return_code, scan_cli_json_path) {
        this.return_code = return_code;
        this.scan_cli_json_path = scan_cli_json_path;
    }
}
exports.PolarisRunResult = PolarisRunResult;
class PolarisIssueWaiter {
    constructor(log) {
        this.log = log;
    }
    wait_for_issues(scan_cli_json_path, polaris_service) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!fs.existsSync(scan_cli_json_path)) {
                this.log.warn(`Scan result file not found at: ${scan_cli_json_path}. Skipping issue processing.`);
                return 0;
            }
            var scan_json_text = fs.readFileSync(scan_cli_json_path);
            var scan_json = JSON.parse(scan_json_text);
            var issue_counts = json_path.query(scan_json, "$.issueSummary.total");
            var job_status_urls = json_path.query(scan_json, "$.tools[*].jobStatusUrl");
            if (job_status_urls.length > 0) {
                this.log.info("Waiting for jobs: " + job_status_urls.length);
                var polaris_job_service = new PolarisJobService(this.log, polaris_service);
                yield polaris_job_service.waitForJobsToEnd(job_status_urls);
            }
            else {
                this.log.info("No jobs were found to wait for.");
            }
            var project_id = json_path.query(scan_json, "$.projectInfo.projectId");
            var branch_id = json_path.query(scan_json, "$.projectInfo.branchId");
            var revision_id = json_path.query(scan_json, "$.projectInfo.revisionId");
            var issue_api_url = json_path.query(scan_json, "$.scanInfo.issueApiUrl");
            if (issue_api_url.length > 0) {
                this.log.info("Getting issues from Polaris Software Integrity Platform server.");
                var issue_response = yield polaris_service.fetch_issue_data(issue_api_url[0]);
                issue_counts = json_path.query(issue_response.data, "$.data..attributes.value");
            }
            if (issue_counts.length != 0) {
                var total_count = issue_counts.reduce((a, b) => a + b, 0);
                this.log.info("Total issues found : " + total_count + " (This will may be filtered for reporting");
                return total_count;
            }
            else {
                this.log.info("Did not find any issue counts.");
                return null;
            }
        });
    }
}
exports.PolarisIssueWaiter = PolarisIssueWaiter;
class PolarisJobService {
    constructor(log, polaris_client) {
        this.log = log;
        this.polaris_client = polaris_client;
    }
    waitForJobsToEnd(status_job_urls) {
        return __awaiter(this, void 0, void 0, function* () {
            var self = this;
            yield asyncForEach(status_job_urls, function (job) {
                return __awaiter(this, void 0, void 0, function* () {
                    console.log(job);
                    yield self.waitForJobToEnd(job);
                    yield self.checkJobSuccess(job);
                });
            });
        });
    }
    waitForJobToEnd(status_job_url) {
        return __awaiter(this, void 0, void 0, function* () {
            var running = true;
            while (running) {
                var jobEnded = yield this.hasJobEnded(status_job_url);
                if (jobEnded) {
                    running = false;
                }
                else {
                    this.log.info("Waiting 2 seconds for job to complete.");
                    yield sleep(2000);
                }
            }
        });
    }
    hasJobEnded(status_job_url) {
        return __awaiter(this, void 0, void 0, function* () {
            var job_response = yield this.polaris_client.get_job(status_job_url);
            var status = json_path.query(job_response.data, "$.data.attributes.status.state");
            if (containsAny(status, ["QUEUED", "RUNNING", "DISPATCHED"])) {
                return false;
            }
            return true;
        });
    }
    checkJobSuccess(status_job_url) {
        return __awaiter(this, void 0, void 0, function* () {
            var job_response = yield this.polaris_client.get_job(status_job_url);
            var status = json_path.query(job_response.data, "$.data.attributes.status.state");
            if (containsAny(status, ["FAILED"])) {
                var reason = json_path.query(job_response.data, "$.data.attributes.failureInfo.userFiendlyFailureReason");
                if (reason.length > 0) {
                    this.log.error("Check the job status in Polaris Software Integrity Platform for more details.");
                    throw new Error(JSON.stringify(reason));
                }
            }
            return true;
        });
    }
}
exports.PolarisJobService = PolarisJobService;
function asyncForEach(array, func) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let index = 0; index < array.length; index++) {
            yield func(array[index], index, array);
        }
    });
}
function containsAny(array, elements) {
    return array.some(r => elements.indexOf(r) >= 0);
}
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    });
}
//# sourceMappingURL=classes.js.map