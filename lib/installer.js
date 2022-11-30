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
exports.installReviewdog = void 0;
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const http = __importStar(require("@actions/http-client"));
function installReviewdog(tag, directory) {
    return __awaiter(this, void 0, void 0, function* () {
        const owner = "reviewdog";
        const repo = "reviewdog";
        const version = yield tagToVersion(tag, owner, repo);
        // get the os information
        let platform = process.platform.toString();
        let ext = "";
        switch (platform) {
            case "darwin":
                platform = "Darwin";
                break;
            case "linux":
                platform = "Linux";
                break;
            case "win32":
                platform = "Windows";
                ext = ".exe";
                break;
            default:
                throw new Error(`unsupported platform: ${platform}`);
        }
        // get the arch information
        let arch = process.arch;
        switch (arch) {
            case "x64":
                arch = "x86_64";
                break;
            case "arm64":
                break;
            case "x32":
                arch = "i386";
                break;
            default:
                throw new Error(`unsupported arch: ${arch}`);
        }
        const url = `https://github.com/${owner}/${repo}/releases/download/v${version}/reviewdog_${version}_${platform}_${arch}.tar.gz`;
        core.info(`downloading from ${url}`);
        const archivePath = yield tc.downloadTool(url);
        core.info(`extracting`);
        const extractedDir = yield tc.extractTar(archivePath, directory);
        return path.join(extractedDir, `reviewdog${ext}`);
    });
}
exports.installReviewdog = installReviewdog;
function tagToVersion(tag, owner, repo) {
    return __awaiter(this, void 0, void 0, function* () {
        core.info(`finding a release for ${tag}`);
        const url = `https://github.com/${owner}/${repo}/releases/${tag}`;
        const client = new http.HttpClient("action-golangci-lint/v1");
        const headers = { [http.Headers.Accept]: "application/json" };
        const response = yield client.getJson(url, headers);
        if (response.statusCode != http.HttpCodes.OK) {
            core.error(`${url} returns unexpected HTTP status code: ${response.statusCode}`);
        }
        if (!response.result) {
            throw new Error(`unable to find '${tag}' - use 'latest' or see https://github.com/${owner}/${repo}/releases for details`);
        }
        let realTag = response.result.tag_name;
        // if version starts with 'v', remove it
        realTag = realTag.replace(/^v/, "");
        return realTag;
    });
}
