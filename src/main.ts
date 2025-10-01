import * as core from '@actions/core'
import {
  ElasticMessageFormat,
  createAxiosGithubInstance,
  createElasticInstance,
  sendMessagesToElastic,
  sendRequestToGithub
} from './requests'
import {loadInput} from './tool'

async function run(): Promise<void> {
  try {
    const githubToken: string = loadInput('githubToken')
    const githubOrg: string = loadInput('githubOrg')
    const githubRepository: string = loadInput('githubRepository')
    const githubRunId: string = loadInput('githubRunId')
    const elasticApiKeyId: string = loadInput('elasticApiKeyId')
    const elasticApiKey: string = loadInput('elasticApiKey')
    const elasticHost: string = loadInput('elasticHost')
    const elasticIndex: string = loadInput('elasticIndex')
    const elasticCloudId: string = loadInput('elasticCloudId')
    const elasticCloudUser: string = loadInput('elasticCloudUser')
    const elasticCloudPassword: string = loadInput('elasticCloudPassword')
    const totalTests= loadInput('totalTests') || null
    const passedTests= loadInput('passedTests') || null
    const failedTests = loadInput('failedTests') || null

    core.info(`Initializing Github Connection Instance`)
    const githubInstance = createAxiosGithubInstance(githubToken)
    core.info(`Initializing Elastic Instance`)
    const elasticInstance = createElasticInstance(
      elasticHost,
      elasticApiKeyId,
      elasticApiKey,
      elasticCloudId,
      elasticCloudUser,
      elasticCloudPassword
    )

    const metadataUrl = `/repos/${githubOrg}/${githubRepository}/actions/runs/${githubRunId}`
    core.info(`Retrieving metadata from Github Pipeline ${githubRunId}`)
    const metadata = await sendRequestToGithub(githubInstance, metadataUrl)
    const jobsUrl = metadata.jobs_url
    core.info(`Retrieving jobs list  from Github Pipeline ${githubRunId}`)
    const jobs = await sendRequestToGithub(githubInstance, jobsUrl)
    const regex = /^run-tests\s*\/\s*run-tests.*$/i
    for (const job of jobs.jobs) {
      if (regex.test(job.name)) {
        core.info(`Parsing Job name : '${job.name}' and Job Id : '${job.id}'`)
        const achievedJob: ElasticMessageFormat = {
          id: job.id,
          name: job.name,
          metadata,
          status: job.status,
          conclusion: job.conclusion,
          steps: job.steps,
          details: job,
          logs: await sendRequestToGithub(
            githubInstance,
            `/repos/${githubOrg}/${githubRepository}/actions/jobs/${job.id}/logs`
          ),
          //if the totalTests, passedTests and failedTests are not null then they are created and spread into achievedJob obj
          ...(totalTests !== null && { totalTests }),
          ...(passedTests !== null && { passedTests }),
          ...(failedTests !== null && { failedTests })
        }
        await sendMessagesToElastic(elasticInstance, achievedJob, elasticIndex)
      }
    }

  } catch (e) {
    if (e instanceof Error) {
      core.setFailed(e.message)
    }
  }
}

run()
