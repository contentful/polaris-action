import { context, getOctokit } from '@actions/github'
import { PolarisConnection } from "./classes";

export interface CoverityEvent {
    covLStrEventDescription: string
    eventDescription: string
    eventNumber: number
    eventTreePosition: string
    eventSet: number
    eventTag: string
    filePathname: string
    strippedFilePathname: string
    lineNumber: number
    main: boolean
    moreInformationId?: string
    remediation: boolean
    events?: CoverityEvent[]
}

export interface CoverityCheckerProperties {
    category: string
    categoryDescription: string
    cweCategory: string
    issueKinds: string[]
    eventSetCaptions: string[]
    impact: string
    impactDescription: string
    subcategoryLocalEffect: string
    subcategoryLongDescription: string
    subcategoryShortDescription: string
    MISRACategory?: string
}

export interface CoverityTriage {
    classification: string
    action: string
    fixTarget: string
    severity: string
    legacy: string
    owner: string
    externalReference: string
}

export interface CoverityCustomTriage {
    // set of key-value pairs
}

export interface CoverityStateOnServer {
    cid: number
    presentInReferenceSnapshot: boolean
    firstDetectedDateTime: string
    stream: string
    components: string[]
    componentOwners?: any
    cached: boolean
    retrievalDateTime: string
    ownerLdapServerName: string
    triage: CoverityTriage
    customTriage: CoverityCustomTriage
}

export interface CoverityIssueOccurrence {
    mergeKey: string
    occurrenceCountForMK: number
    occurrenceNumberInMK: number
    referenceOccurrenceCountForMK: number
    checkerName: string
    subcategory: string
    type: string
    subtype: string
    extra: string
    domain: string
    language?: string
    'code-language'?: string
    mainEventFilePathname: string
    strippedMainEventFilePathname: string
    mainEventLineNumber: number
    properties: Map<string, string> | any
    functionDisplayName?: string
    functionMangledName?: string
    localStatus?: string
    ordered: boolean
    events: CoverityEvent[]
    checkerProperties?: CoverityCheckerProperties
    stateOnServer?: CoverityStateOnServer
}

import { RestEndpointMethodTypes } from '@octokit/rest'

// @octokit/rest > Endpoints.d.ts > PullsGetResponseData
export type PullRequest = RestEndpointMethodTypes['pulls']['get']['response']['data']

// @octokit/rest > Endpoints.d.ts > /repos/{owner}/{repo}/pulls/{pull_number}/reviews > comments
export type ReviewCommentsParameter = RestEndpointMethodTypes['pulls']['createReview']['parameters']['comments']
export type NewReviewComment = (ReviewCommentsParameter & Exclude<ReviewCommentsParameter, undefined>)[number]

// @octokit/rest > Endpoints.d.ts > /repos/{owner}/{repo}/pulls/{pull_number}/comments
export type ExistingReviewComment = RestEndpointMethodTypes['pulls']['listReviewComments']['response']['data'][number]

// @octokit/rest > Endpoints.d.ts > /repos/{owner}/{repo}/issues/{issue_number}/comments
export type ExistingIssueComment = RestEndpointMethodTypes['issues']['listComments']['response']['data'][number]

export class GitHubCheck {
    checkName: string
    checkRunId: number
    githubToken: string

    constructor(checkName: string, checkRunId: number, githubToken: string) {
        this.checkName = checkName
        this.checkRunId = checkRunId
        this.githubToken = githubToken
    }

    async passCheck(summary: string, text: string) {
        return this.finishCheck('success', summary, text)
    }

    async failCheck(summary: string, text: string) {
        return this.finishCheck('failure', summary, text)
    }

    async skipCheck() {
        return this.finishCheck('skipped', `${this.checkName} was skipped`, '')
    }

    async cancelCheck() {
        return this.finishCheck('cancelled', `${this.checkName} Check could not be completed`, `Something went wrong and the ${this.checkName} could not be completed. Check your action logs for more details.`)
    }

    private async finishCheck(conclusion: string, summary: string, text: string) {
        const octokit = getOctokit(this.githubToken)

        const response = await octokit.rest.checks.update({
            owner: context.repo.owner,
            repo: context.repo.repo,
            check_run_id: this.checkRunId,
            status: 'completed',
            conclusion,
            output: {
                title: this.checkName,
                summary,
                text
            }
        })

        if (response.status !== 200) {
            console.warn(`Unexpected status code recieved when creating check: ${response.status}`)
            console.debug(JSON.stringify(response, null, 2))
        } else {
            console.info(`${this.checkName} updated`)
        }
    }
}

export interface CoverityIssuesView {
    type: string
    formatVersion: number
    suppressedIssueCount: number
    issues: CoverityIssueOccurrence[]
    error?: CoverityError
    warnings: CoverityError[]
    desktopAnalysisSettings: CoverityDesktopAnalysisSettings
}

export interface CoverityError {
    errorType: string
    errorSubType: string
    errorMessage: any
    // ... other errorType-specific attributes ...
}

export interface CoverityDesktopAnalysisSettings {
    analysisDateTime: string
    covRunDesktopArgs: string[]
    effectiveStripPaths: string[]
    analysisScopePathnames: string[]
    strippedAnalysisScopePathnames: string[]
    auxiliaryScopePathnames: string[]
    strippedAuxiliaryScopePathnames: string[]
    relativeTo?: string
    intermediateDir: string
    effectiveAnalysisSettings: CoverityPortableAnalysisSettings
    referenceSnapshot?: CoverityReferenceSnapshotDetails
}

export interface CoverityReferenceSnapshotDetails {
    snapshotId: number
    codeVersionDateTime: string
    description: string
    version: string
    analysisVersion: string
    analysisVersionOverride: string
    target: string
    analysisSettings: CoverityPortableAnalysisSettings
}

export interface CoverityPortableAnalysisSettings {
    covAnalyzeArgs: string[]
    fbExcludeConfigurations: string[]
    fbIncludeConfiguration: string
    fileCheckerOptions: CoverityFileCheckerOption[]
}

export interface CoverityFileCheckerOption {
    checkerName: string
    optionName: string
    fileContents: string
}

export interface PolarisTaskInputs {
    polaris_connection: PolarisConnection
    build_command: string,
    should_wait_for_issues: boolean

    should_populate_changeset: boolean
    should_empty_changeset_fail: boolean
}

export interface IPolarisIssueUnified {
    key: string,
    name: string,
    description: string,
    localEffect: string,
    checkerName: string,
    path: string,
    line: number,
    severity: string,
    cwe: string,
    mainEvent: string,
    mainEventDescription: string,
    remediationEvent: string,
    remediationEventDescription: string,
    dismissed: boolean,
    events: IPolarisIssueUnifiedEvent[],
    link: string
}

export interface IPolarisIssueUnifiedEvent {
    "description": string,
    "number": number,
    "tag": string,
    "type": string,
    "line-number": number,
    "source-before": IPolarisCodeAnalysisEventSource,
    "source-after": IPolarisCodeAnalysisEventSource,
    "filePath": string
}

interface IPolarisCodeAnalysisEventSource {
    "start-line": number,
    "end-line": number,
    "source-code": string
}

export interface IPolarisBranchData {
    data: IPolarisBranch[],
    "meta": {
        "offset": number,
        "limit": number,
        "total": number
    }
}

export interface IPolarisBranch {
    "type": string,
    "id": string,
    "attributes": {
        "name": string,
        "main-for-project": boolean
    },
    relationships: {
        "revisions"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "project"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        }
    }
    links: {
        self: IPolarisHref
    },
    meta: {
        "etag": string,
        "organization-id": string,
        "in-trash": boolean
    }
}

interface IPolarisRelationshipLink {
    self: string,
    related: string
}

interface IPolarisRelationshipData {
    type: string,
    id: string
}

interface IPolarisHref {
    "href": string,
    "meta": {
        "durable": string
    }
}

export interface IPolarisIssueData {
    data: IPolarisIssue[],
    included: IPolarisIssueIncluded[],
    meta: {
        "total": number,
        "offset": number,
        "limit": number,
        "complete": true,
        "run-count": number,
        "latest-run-ids": string[]
    }
}

export interface IPolarisIssue {
    type: string,
    id: string,
    attributes: {
        "finding-key": string,
        "issue-key": string,
        "sub-tool": string,
        "severity": string
    },
    relationships: {
        "path"?: {
            data: IPolarisRelationshipData
        },
        "tool-domain-service"?: {
            data: IPolarisRelationshipData
        },
        "reachability"?: {
            data: IPolarisRelationshipData
        },
        "issue-type"?: {
            data: IPolarisRelationshipData
        },
        "tool"?: {
            data: IPolarisRelationshipData
        },
        "latest-observed-on-run"?: {
            data: IPolarisRelationshipData
        },
        "transitions"?: {
            data: IPolarisRelationshipData[]
        },
        "related-taxa"?: {
            data: IPolarisRelationshipData[]
        },
        "related-indicators"?: {
            data: IPolarisRelationshipData[]
        },
        "severity"?: {
            data: IPolarisRelationshipData
        }
    },
    links: {
        self: IPolarisHref
    }
}

export interface IPolarisIssueIncluded {
    "id": string,
    "type": string,
    "attributes": {
        "transition-type"?: string,
        "cause"?: string,
        "human-readable-cause"?: string,
        "transition-date"?: string,
        "branch-id"?: string,
        "revision-id"?: string,
        "run-id"?: string,
        "issue-type"?: string,
        "name"?: string,
        "description"?: string,
        "abbreviation"?: string,
        "local-effect"?: string,
        "path"?: string[]
    }
}

export interface IPolarisCodeAnalysisEvents {
    "run-id": string,
    "finding-key": string,
    "main-event-file-path": string[],
    "main-event-line-number": number,
    language: string,
    "example-events-caption": string,
    "example-events-groups": string[],
    events: IPolarisCodeAnalysisEvent[],
    type: string
}

export interface IPolarisCodeAnalysisEvent {
    "covlstr-event-description": string,
    "event-description": string,
    "event-number": number,
    "event-set": number,
    "event-tag": string,
    "event-tree-position": string,
    "event-type": string,
    "line-number": number,
    "source-before": IPolarisCodeAnalysisEventSource,
    "source-after": IPolarisCodeAnalysisEventSource,
    "path": string[],
    "filePath": string,
    "evidence-events": IPolarisCodeAnalysisEvent[],
}

interface IPolarisCodeAnalysisEventSource {
    "start-line": number,
    "end-line": number,
    "source-code": string
}

export interface IPolarisIssueDataReturn {
    issueData: IPolarisIssue[],
    issueIncluded: IPolarisIssueIncluded[]
}

export interface IPolarisIssueUnifiedEvent {
    "description": string,
    "number": number,
    "tag": string,
    "type": string,
    "line-number": number,
    "source-before": IPolarisCodeAnalysisEventSource,
    "source-after": IPolarisCodeAnalysisEventSource,
    "filePath": string
}

export interface IPolarisCodeAnalysisEventsData {
    data: IPolarisCodeAnalysisEvents[],
    meta: {
        "limit": number,
        "offset": number,
        "total": number
    }
}

export interface IPolarisCodeAnalysisEvents {
    "run-id": string,
    "finding-key": string,
    "main-event-file-path": string[],
    "main-event-line-number": number,
    language: string,
    "example-events-caption": string,
    "example-events-groups": string[],
    events: IPolarisCodeAnalysisEvent[],
    type: string
}

export interface IPolarisCodeAnalysisEvent {
    "covlstr-event-description": string,
    "event-description": string,
    "event-number": number,
    "event-set": number,
    "event-tag": string,
    "event-tree-position": string,
    "event-type": string,
    "line-number": number,
    "source-before": IPolarisCodeAnalysisEventSource,
    "source-after": IPolarisCodeAnalysisEventSource,
    "path": string[],
    "filePath": string,
    "evidence-events": IPolarisCodeAnalysisEvent[],
}

interface IPolarisCodeAnalysisEventSource {
    "start-line": number,
    "end-line": number,
    "source-code": string
}

export interface IPolarisBranch {
    "type": string,
    "id": string,
    "attributes": {
        "name": string,
        "main-for-project": boolean
    },
    relationships: {
        "revisions"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "project"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        }
    }
    links: {
        self: IPolarisHref
    },
    meta: {
        "etag": string,
        "organization-id": string,
        "in-trash": boolean
    }
}

export interface IPolarisIssueTriageData {
    data: IPolarisIssueTriage
}

export interface IPolarisIssueTriage {
    type: string,
    id: string,
    links: {
        self: IPolarisHref
    },
    attributes: {
        "issue-key": string,
        "project-id": string,
        "triage-current-values": IPolarisIssueTriageValue[]
    }
}

export interface IPolarisIssueTriageValue {
    "attribute-semantic-id": string,
    "attribute-name": string,
    "kind": string,
    "value": string,
    "timestamp": string,
    "display-value": string
}

export interface IPolarisRun {
    type: string,
    id: string,
    attributes: {
        "fingerprints": string,
        "upload-id": string,
        "run-type": string,
        "creation-date": string,
        "completed-date": string,
        "status": string,
        "segment": string
    },
    relationships: {
        "project"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "tool"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "previous-run"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "properties"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "revision"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "tool-domain-service"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "submitting-organization"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
        "submitting-user"?: {
            links: IPolarisRelationshipLink,
            data: IPolarisRelationshipData
        },
    }
    links: {
        self: IPolarisHref
    },
    meta: {
        "etag": string,
        "organization-id": string,
        "in-trash": boolean
    }
}

export interface IPolarisRunData {
    data: IPolarisRun[],
    "meta": {
        "offset": number,
        "limit": number,
        "total": number
    }
}