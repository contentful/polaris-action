const HttpsProxyAgent = require("https-proxy-agent");
const url = require('url');
const Axios = require('axios');
const moment = require("moment");
const CancelToken = Axios.CancelToken;
const fs = require('fs');
const json_path = require('jsonpath');
const debug = require('debug');
import { Logger } from "winston";
const path = require('path');
const fse = require('fs-extra');
import { logger } from "./utils";
import * as os from 'os';
const zipper = require('adm-zip');
const urlParser = require('url');
import { exec } from "@actions/exec";

import {
    PolarisTaskInputs
} from "./interfaces";

export class PolarisConnection {
    constructor(url: string, token: string, proxy: PolarisProxyInfo | undefined) {
        this.url = url;
        this.token = token;
        this.proxy = proxy;
    }
    url: string;
    token: string;
    proxy: PolarisProxyInfo | undefined;
}

export class PolarisProxyInfo {
    proxy_url: string;
    proxy_username: string | undefined;
    proxy_password: string | undefined;
    constructor(proxy_url: string, proxy_username: string | undefined, proxy_password: string | undefined) {
        this.proxy_url = proxy_url;
        this.proxy_username = proxy_username;
        this.proxy_password = proxy_password;
    }
}

export class PolarisInputReader {
    getPolarisInputs(polaris_url: string, polaris_token: string,
        proxy_url: string, proxy_username: string, proxy_password: string,
        build_command: string,
        should_wait_for_issues: boolean,
        should_changeset: boolean,
        should_changeset_fail: boolean): PolarisTaskInputs {
        var polaris_proxy_info: PolarisProxyInfo | undefined = undefined;

        if (proxy_url && proxy_url.length > 0 && proxy_username && proxy_username.length > 0 &&
            proxy_password && proxy_password.length > 0) {
            polaris_proxy_info = new PolarisProxyInfo(proxy_url, proxy_username, proxy_password);
        } else {
            polaris_proxy_info = undefined
        }

        if (polaris_url.endsWith("/") || polaris_url.endsWith("\\")) {
            polaris_url = polaris_url.slice(0, -1);
        }

        if (build_command.includes("--incremental")) {
            should_changeset = true
        }

        return {
            polaris_connection: new PolarisConnection(polaris_url, polaris_token, polaris_proxy_info),
            build_command: build_command,
            should_wait_for_issues: should_wait_for_issues,
            should_empty_changeset_fail: should_changeset_fail,
            should_populate_changeset: should_changeset
        }
    }
}

export class PolarisService {
    log: any;
    polaris_url: string;
    access_token: string;
    bearer_token: string | null;
    headers: any | null;
    axios: any;
    constructor(log: any, connection: PolarisConnection) {
        if (connection.url.endsWith("/") || connection.url.endsWith("\\")) {
            this.polaris_url = connection.url.slice(0, -1);
        } else {
            this.polaris_url = connection.url;
        }

        this.access_token = connection.token;
        this.bearer_token = null;
        this.headers = null;
        this.log = log;


        if (connection.proxy != undefined) {
            log.info(`Using Proxy URL: ${connection.proxy.proxy_url}`)
            var proxyOpts = url.parse(connection.proxy.proxy_url);

            var proxyConfig: any = {
                host: proxyOpts.hostname,
                port: proxyOpts.port
            };

            if (connection.proxy.proxy_username && connection.proxy.proxy_password) {
                log.info("Using configured proxy credentials.")
                proxyConfig.auth = connection.proxy.proxy_username + ":" + connection.proxy.proxy_password;
            }

            const httpsAgent = new HttpsProxyAgent(proxyConfig)
            this.axios = Axios.create({ httpsAgent });
        } else {
            this.axios = Axios.create();
        }
    }

    async authenticate() {
        this.log.info("Authenticating with Polaris Software Integrity Platform.")
        debug.enable('https-proxy-agent');
        this.bearer_token = await this.fetch_bearer_token();
        debug.disable();
        this.headers = {
            Authorization: `Bearer ${this.bearer_token}`
        }
    }

    async get_job(job_status_url: string) {
        return await this.axios.get(job_status_url, {
            headers: this.headers
        });
    }

    fetch_bearer_token(): Promise<string> {
        // this is a workaround for https://github.com/TooTallNate/node-https-proxy-agent/issues/102
        //basically NodeJS thinks all event loops are closed, this ensures the event look hasn't closed. 
        // TODO: Need to switch to a new http library that doesn't suffer from this bug.
        //Basically we need to reject the promise ourselves 
        const resultPromise = new Promise<string>((resolve, reject) => {
            const timeout = 10000
            setTimeout(() => { reject(new Error(`Failed to authenticate with Polaris Software Integrity Platform. This may be a problem with your url, proxy setup or network.`)) }, timeout);

            var authenticateUrl = this.polaris_url + "/api/auth/authenticate";

            try {
                this.axios.post(authenticateUrl, "accesstoken=" + this.access_token, { timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).then((authResponse: any) => {
                    if (authResponse.data.jwt) {
                        this.log.info("Succesfully authenticated, saving bearer token.")
                        resolve(authResponse.data.jwt);
                    } else {
                        this.log.error(`Failed to authenticate with Polaris Software Integrity Platform, no bearer token received.`)
                        reject(new Error(`Failed to authenticate with Polaris Software Integrity Platform. Status: ${authResponse.status} Reason: ${authResponse.statusText}`))
                    }
                }).catch((e: any) => {
                    this.log.error(`Unable to authenticate with Polaris Software Integrity Platform at url: ${authenticateUrl}`);
                    this.log.error(`This may be a problem with your Polaris Software Integrity Platform url, proxy setup or network.`);
                    reject(e);
                })
            } catch (e) {
                this.log.error(`Unable to authenticate with Polaris Software Integrity Platform at url: ${authenticateUrl}`);
                this.log.error(`This may be a problem with your Polaris Software Integrity Platform url, proxy setup or network.`);
                reject(e);
            }
        })
        return resultPromise;
    }

    async fetch_cli_modified_date(url: string): Promise<any> { //return type should be a moment
        var token = CancelToken.source();
        var self = this;
        self.log.debug("Fetching cli modified date from: " + url);
        return new Promise((resolve, reject) => {
            this.axios({
                url: url,
                method: 'GET',
                responseType: 'stream', // important, let's us cancel the after we get the headers.
                cancelToken: token.token
            }).then(function (response: any) {
                var lastModifiedText = response.headers['last-modified'];
                self.log.debug("Last Modified Header: " + lastModifiedText);
                var lastModifiedDate = moment(lastModifiedText);
                self.log.debug("Last Modified Date: " + lastModifiedDate.format());
                token.cancel();
                resolve(lastModifiedDate);
            }).catch(function (error: any) {
                reject(error);
            });
        });
    }

    async fetch_issue_data(url: string): Promise<any> {
        return await this.axios.get(url, {
            headers: this.headers
        });
    }

    async get_url(url: string): Promise<any> {
        return await this.axios.get(url, {
            headers: this.headers
        });
    }

    async fetch_organization_name(): Promise<string | null> {
        var target = this.polaris_url + "/api/auth/contexts";
        var result = await this.axios({
            url: target,
            method: 'GET',
            responseType: 'json',
            headers: this.headers,
        });
        var organization_names = json_path.query(result.data, "$.data[*].attributes.organizationname");
        if (organization_names.length > 0) {
            return organization_names[0];
        } else {
            return null;
        }
    }

    async download_cli(url: string, file: string) {
        this.log.debug("Downloading cli from: " + url);
        this.log.debug("Downloading cli to: " + file);

        const writer = fs.createWriteStream(file);

        const response = await this.axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject)
        });
    }
}

export class ChangeSetEnvironment {
    log: Logger;
    env: any;
    constructor(log: Logger, env: any) {
        this.log = log;
        this.env = env;
    }

    set_enable_incremental() {
        this.env["POLARIS_FF_ENABLE_COVERITY_INCREMENTAL"] = "true";
    }

    is_file_path_present(): boolean {
        if ("CHANGE_SET_FILE_PATH" in this.env) {
            return true;
        } else {
            return false;
        }
    }

    set_default_file_path(cwd: string) {
        this.env["CHANGE_SET_FILE_PATH"] = path.join(cwd, ".synopsys", "polaris", "changeSetFile.txt");
    }

    get_file_path(): string {
        return this.env["CHANGE_SET_FILE_PATH"]
    }

    get_or_create_file_path(cwd: string): string {
        if (this.is_file_path_present()) {
            return this.get_file_path();
        } else {
            this.set_default_file_path(cwd);
            return this.get_file_path();
        }
    }
}

export class ChangeSetFileWriter {
    log: Logger;
    constructor(log: Logger) {
        this.log = log;
    }
    async write_change_set_file(file: string, paths: Array<string>): Promise<number> { //must return something
        await fse.ensureFile(file);

        return new Promise<number>((resolve, reject) => {
            var content = paths.join("\n");
            fs.writeFile(file, content, (err: any) => {
                if (err) {
                    logger.error("Writing change set file failed: " + err)
                    return reject(err);
                } else {
                    logger.info("Created change set file: " + file);
                    return resolve(0);
                }
            });
        });
    }
}

export class ChangeSetReplacement {
    replace_build_command(build_command: string, path: string): string {
        return build_command.split("$CHANGE_SET_FILE_PATH").join(path);
    }
}

export default class PolarisExecutableFinder {
    log: any;
    platformSupport: PolarisPlatformSupport;
    constructor(log: any, platformSupport: PolarisPlatformSupport) {
        this.log = log;
        this.platformSupport = platformSupport;
    }

    async find_executable(polaris_install: string): Promise<string> {
        var polarisInternalFolders = fs.readdirSync(polaris_install);
        var polarisFolder = path.join(polaris_install, polarisInternalFolders[0]);
        var bin = path.join(polarisFolder, "bin");
        var exes = fs.readdirSync(bin);
        for (var i in exes) {
            var file = exes[i];
            await this.ensure_executable(path.join(bin, file));
        }
        var polaris_exe = this.platformSupport.platform_specific_executable_name("polaris");
        return path.join(bin, polaris_exe);
    }

    private async ensure_executable(exe: string): Promise<string> {
        if (fs.existsSync(exe)) {
            this.log.debug(`Ensuring ${exe} is executable.`)
            fs.chmodSync(exe, 0o775);
            return exe;
        } else {
            throw new Error(`Could not make ${exe} executable.`);
        }
    }
}

export class PolarisPlatformSupport {
    platform_specific_cli_zip_url_fragment(client: string) {
        var platform = os.platform();
        if (platform == "win32") {
            return "/api/tools/" + client + "_cli-win64.zip";
        } else if (platform == "darwin") {
            return "/api/tools/" + client + "_cli-macosx.zip";
        } else {
            return "/api/tools/" + client + "_cli-linux64.zip";
        }
    }

    platform_specific_executable_name(client: string) {
        var platform = os.platform();
        if (platform == "win32") {
            return client + ".exe";
        } else {
            return client;
        }
    }
}

export class PolarisInstall {
    polaris_executable: string;
    polaris_home: string;
    constructor(polaris_executable: string, polaris_home: string) {
        this.polaris_executable = polaris_executable;
        this.polaris_home = polaris_home;
    }
}

export class PolarisInstaller {
    log: any;
    executable_finder: PolarisExecutableFinder;
    platform_support: PolarisPlatformSupport;
    polaris_service: PolarisService;

    static default_installer(log: any, polaris_service: PolarisService) {
        const platform_support = new PolarisPlatformSupport();
        const executable_finder = new PolarisExecutableFinder(log, platform_support);
        return new PolarisInstaller(log, executable_finder, platform_support, polaris_service);
    }

    constructor(log: any, executable_finder: PolarisExecutableFinder, platform_support: PolarisPlatformSupport, polaris_service: PolarisService) {
        this.log = log;
        this.executable_finder = executable_finder;
        this.platform_support = platform_support;
        this.polaris_service = polaris_service;
    }

    async install_or_locate_polaris(polaris_url: string, polaris_install_path: string): Promise<PolarisInstall> {
        var polaris_cli_name = "polaris"; // used to be "swip"

        var polaris_cli_location = path.resolve(polaris_install_path, "polaris");
        var version_file = path.join(polaris_cli_location, "version.txt");
        var relative_cli_url = this.platform_support.platform_specific_cli_zip_url_fragment(polaris_cli_name);
        var cli_url = polaris_url + relative_cli_url;
        var synopsys_path = path.resolve(polaris_install_path, ".synopsys");
        var polaris_home = path.resolve(synopsys_path, "polaris");

        this.log.info(`Using polaris cli location: ` + polaris_cli_location)
        this.log.info(`Using polaris cli url: ` + cli_url)
        this.log.debug("Checking for version file: " + version_file)

        var download_cli = false;
        var available_version_date = await this.polaris_service.fetch_cli_modified_date(cli_url);
        if (fs.existsSync(version_file)) {
            this.log.debug("Version file exists.")
            var current_version_date = moment(fs.readFileSync(version_file, { encoding: 'utf8' }));
            this.log.debug("Current version: " + current_version_date.format())
            this.log.debug("Available version: " + available_version_date.format())
            if (current_version_date.isBefore(available_version_date)) {
                this.log.info("Downloading Polaris CLI because a newer version is available.")
                download_cli = true;
            } else {
                this.log.info("Existing Polaris CLI will be used.")
            }
        } else {
            this.log.info("Downloading Polaris CLI because a version file did not exist.")
            download_cli = true;
        }

        if (download_cli) {
            if (fs.existsSync(polaris_cli_location)) {
                this.log.info(`Cleaning up the Polaris installation directory: ${polaris_cli_location}`);
                this.log.info("Please do not place anything in this folder, it is under extension control.");
                fse.removeSync(polaris_cli_location);
            }

            this.log.info("Starting download.")
            const polaris_zip = path.join(polaris_install_path, "polaris.zip");
            await this.polaris_service.download_cli(cli_url, polaris_zip);

            this.log.info("Starting extraction.")
            var zip = new zipper(polaris_zip);
            await zip.extractAllTo(polaris_cli_location, /*overwrite*/ true);
            this.log.info("Download and extraction finished.")

            fse.ensureFileSync(version_file);
            fs.writeFileSync(version_file, available_version_date.format(), 'utf8');
            this.log.info(`Wrote version file: ${version_file}`)
        }

        this.log.info("Looking for Polaris executable.")
        var polaris_exe = await this.executable_finder.find_executable(polaris_cli_location);
        this.log.info("Found executable: " + polaris_exe)
        return new PolarisInstall(polaris_exe, polaris_home);
    }
}

export class PolarisRunner {
    log: any;
    constructor(log: any) {
        this.log = log;
    }

    async execute_cli(connection: PolarisConnection, polaris_install: PolarisInstall, cwd: string, build_command: string): Promise<PolarisRunResult> {
        var env: any = process.env;

        env["POLARIS_SERVER_URL"] = connection.url;
        env["POLARIS_ACCESS_TOKEN"] = connection.token;

        if (connection.proxy != undefined) {
            var proxyOpts = urlParser.parse(connection.proxy.proxy_url);
            if (connection.proxy.proxy_username && connection.proxy.proxy_password) {
                proxyOpts.auth = connection.proxy.proxy_username + ":" + connection.proxy.proxy_password;
            }
            env["HTTPS_PROXY"] = urlParser.format(proxyOpts);
        }

        if ("POLARIS_HOME" in env) {
            this.log.info("A POLARIS_HOME exists, will not attempt to override.")
        } else {
            var override_home = polaris_install.polaris_home;
            if (!fs.existsSync(override_home)) {
                this.log.info("Creating plugin Polaris home: " + override_home)
                fse.ensureDirSync(override_home);
            } else {
                this.log.debug("Polaris home already exists, it will not be created.")
            }

            if (fs.existsSync(override_home)) {
                this.log.info("Set POLARIS_HOME to directory: " + override_home)
                env["POLARIS_HOME"] = override_home
            } else {
                this.log.error("Unable to create a POLARIS_HOME and env variable was not set. Will not override. Try creating POLARIS_HOME on the agent or ensuring agent has access.")
            }
        }

        logger.info(`Executing ${polaris_install.polaris_executable} with line=${build_command}`)

        var return_code = await exec(polaris_install.polaris_executable,
            build_command.split(' '),
            { ignoreReturnCode: true })

        var synopsysFolder = path.join(cwd, ".synopsys");
        var polarisFolder = path.join(synopsysFolder, "polaris");
        var scanJsonFile = path.join(polarisFolder, "cli-scan.json");

        delete process.env["HTTPS_PROXY"];

        return new PolarisRunResult(return_code, scanJsonFile);
    }
}

export class PolarisRunResult {
    return_code: Number;
    scan_cli_json_path: string;
    constructor(return_code: Number, scan_cli_json_path: string) {
        this.return_code = return_code;
        this.scan_cli_json_path = scan_cli_json_path;
    }
}

export class PolarisIssueWaiter {
    log: any;
    constructor(log: any) {
        this.log = log;
    }

    async wait_for_issues(scan_cli_json_path: String, polaris_service: PolarisService): Promise<number | null> {
        var scan_json_text = fs.readFileSync(scan_cli_json_path);
        var scan_json = JSON.parse(scan_json_text);

        var issue_counts = json_path.query(scan_json, "$.issueSummary.total");

        var job_status_urls = json_path.query(scan_json, "$.tools[*].jobStatusUrl");
        if (job_status_urls.length > 0) {
            this.log.info("Waiting for jobs: " + job_status_urls.length)
            var polaris_job_service = new PolarisJobService(this.log, polaris_service);
            await polaris_job_service.waitForJobsToEnd(job_status_urls);
        } else {
            this.log.info("No jobs were found to wait for.")
        }

        var project_id = json_path.query(scan_json, "$.projectInfo.projectId")
        var branch_id = json_path.query(scan_json, "$.projectInfo.branchId")
        var revision_id = json_path.query(scan_json, "$.projectInfo.revisionId")

        var issue_api_url = json_path.query(scan_json, "$.scanInfo.issueApiUrl");
        if (issue_api_url.length > 0) {
            this.log.info("Getting issues from Polaris Software Integrity Platform server.")
            var issue_response = await polaris_service.fetch_issue_data(issue_api_url[0]);
            issue_counts = json_path.query(issue_response.data, "$.data..attributes.value");
        }

        if (issue_counts.length != 0) {
            var total_count = issue_counts.reduce((a: any, b: any) => a + b, 0)
            this.log.info("Total issues found : " + total_count + "(This will may be filtered for reporting")
            return total_count;
        } else {
            this.log.info("Did not find any issue counts.")
            return null;
        }
    }
}

export class PolarisJobService {
    log: any;
    polaris_client: PolarisService
    constructor(log: any, polaris_client: PolarisService) {
        this.log = log;
        this.polaris_client = polaris_client;
    }

    async waitForJobsToEnd(status_job_urls: string[]) {
        var self = this;
        await asyncForEach(status_job_urls, async function (job: string) {
            await self.waitForJobToEnd(job);
            await self.checkJobSuccess(job);
        });
    }

    async waitForJobToEnd(status_job_url: string) {
        var running = true;
        while (running) {
            var jobEnded = await this.hasJobEnded(status_job_url);

            if (jobEnded) {
                running = false;
            } else {
                this.log.info("Waiting 2 seconds for job to complete.");
                await sleep(2000);
            }
        }
    }

    async hasJobEnded(status_job_url: string): Promise<boolean> {
        var job_response = await this.polaris_client.get_job(status_job_url);
        var status = json_path.query(job_response.data, "$.data.attributes.status.state");
        if (containsAny(status, ["QUEUED", "RUNNING", "DISPATCHED"])) {
            return false;
        }
        return true;
    }

    async checkJobSuccess(status_job_url: string) {
        var job_response = await this.polaris_client.get_job(status_job_url);
        var status = json_path.query(job_response.data, "$.data.attributes.status.state");
        if (containsAny(status, ["FAILED"])) {
            var reason = json_path.query(job_response.data, "$.data.attributes.failureInfo.userFiendlyFailureReason");
            if (reason.length > 0) {
                this.log.error("Check the job status in Polaris Software Integrity Platform for more details.")
                throw new Error(JSON.stringify(reason));
            }
        }
        return true;
    }
}

async function asyncForEach(array: any[], func: any) {
    for (let index = 0; index < array.length; index++) {
        await func(array[index], index, array);
    }
}

function containsAny(array: any[], elements: any[]) {
    return array.some(r => elements.indexOf(r) >= 0);
}

async function sleep(ms: any) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}