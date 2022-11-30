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
exports.GitHubCheck = void 0;
const github_1 = require("@actions/github");
class GitHubCheck {
    constructor(checkName, checkRunId, githubToken) {
        this.checkName = checkName;
        this.checkRunId = checkRunId;
        this.githubToken = githubToken;
    }
    passCheck(summary, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.finishCheck('success', summary, text);
        });
    }
    failCheck(summary, text) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.finishCheck('failure', summary, text);
        });
    }
    skipCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.finishCheck('skipped', `${this.checkName} was skipped`, '');
        });
    }
    cancelCheck() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.finishCheck('cancelled', `${this.checkName} Check could not be completed`, `Something went wrong and the ${this.checkName} could not be completed. Check your action logs for more details.`);
        });
    }
    finishCheck(conclusion, summary, text) {
        return __awaiter(this, void 0, void 0, function* () {
            const octokit = (0, github_1.getOctokit)(this.githubToken);
            const response = yield octokit.rest.checks.update({
                owner: github_1.context.repo.owner,
                repo: github_1.context.repo.repo,
                check_run_id: this.checkRunId,
                status: 'completed',
                conclusion,
                output: {
                    title: this.checkName,
                    summary,
                    text
                }
            });
            if (response.status !== 200) {
                console.warn(`Unexpected status code recieved when creating check: ${response.status}`);
                console.debug(JSON.stringify(response, null, 2));
            }
            else {
                console.info(`${this.checkName} updated`);
            }
        });
    }
}
exports.GitHubCheck = GitHubCheck;
