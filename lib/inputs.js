"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_URL = exports.SKIP_RUN = exports.FAIL_ON_ERROR = exports.SECURITY_GATE_FILTERS = exports.DIAGNOSTIC = exports.DEBUG = exports.POLARIS_COMMAND = exports.POLARIS_ACCESS_TOKEN = exports.POLARIS_URL = exports.GITHUB_TOKEN = void 0;
const core_1 = require("@actions/core");
exports.GITHUB_TOKEN = (0, core_1.getInput)('github_token');
exports.POLARIS_URL = (0, core_1.getInput)('polaris_url');
exports.POLARIS_ACCESS_TOKEN = (0, core_1.getInput)('polaris_access_token');
exports.POLARIS_COMMAND = (0, core_1.getInput)('polaris_command');
exports.DEBUG = (0, core_1.getInput)('debug');
exports.DIAGNOSTIC = (0, core_1.getInput)('diagnostic');
exports.SECURITY_GATE_FILTERS = (0, core_1.getInput)('security_gate_filters');
exports.FAIL_ON_ERROR = (0, core_1.getInput)('fail_on_error');
exports.SKIP_RUN = (0, core_1.getInput)('skip_run');
exports.REPORT_URL = (0, core_1.getInput)('report_url');
//# sourceMappingURL=inputs.js.map