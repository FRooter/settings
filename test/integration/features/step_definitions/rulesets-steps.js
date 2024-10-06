import { dump } from 'js-yaml'
import { StatusCodes } from 'http-status-codes'

import { Given, Then } from '@cucumber/cucumber'
import assert from 'node:assert'
import { http, HttpResponse } from 'msw'

import { repository } from './common-steps.js'
import settings from '../../../../lib/settings.js'
import any from '@travi/any'

const rulesetId = any.integer()
const rulesetName = any.word()
const existingRules = any.listOf(any.simpleObject)

Given('no rulesets are defined for the repository', async function () {
  this.server.use(
    http.get(`https://api.github.com/repos/${repository.owner.name}/${repository.name}/rulesets`, ({ request }) =>
      HttpResponse.json([])
    )
  )
})

Given('a ruleset exists for the repository', async function () {
  const rulesetSubset = { name: rulesetName }
  const existingRulesets = [{ id: rulesetId, ...rulesetSubset }]

  this.server.use(
    http.get(`https://api.github.com/repos/${repository.owner.name}/${repository.name}/rulesets`, ({ request }) => {
      const url = new URL(request.url)

      if (url.searchParams.get('includes_parents') === 'false') return HttpResponse.json(existingRulesets)

      return HttpResponse.json([
        ...existingRulesets,
        ...any.listOf(() => ({ id: any.integer(), ...any.simpleObject() }))
      ])
    }),
    http.get(
      `https://api.github.com/repos/${repository.owner.name}/${repository.name}/rulesets/${rulesetId}`,
      ({ request }) => HttpResponse.json({ id: rulesetId, ...rulesetSubset, rules: existingRules })
    )
  )
})

Given('a ruleset is defined in the config', async function () {
  this.ruleset = { name: any.word() }

  this.server.use(
    http.get(
      `https://api.github.com/repos/${repository.owner.name}/${repository.name}/contents/${encodeURIComponent(
        settings.FILE_NAME
      )}`,
      ({ request }) => HttpResponse.arrayBuffer(Buffer.from(dump({ rulesets: [this.ruleset] })))
    ),
    http.post(
      `https://api.github.com/repos/${repository.owner.name}/${repository.name}/rulesets`,
      async ({ request }) => {
        this.createdRuleset = await request.json()

        return new HttpResponse(null, { status: StatusCodes.CREATED })
      }
    )
  )
})

Given('the ruleset is modified in the config', async function () {
  const additionalRule = any.simpleObject()
  this.updatedRuleset = { name: rulesetName, rules: [...existingRules, additionalRule] }

  this.server.use(
    http.get(
      `https://api.github.com/repos/${repository.owner.name}/${repository.name}/contents/${encodeURIComponent(
        settings.FILE_NAME
      )}`,
      ({ request }) => HttpResponse.arrayBuffer(Buffer.from(dump({ rulesets: [this.updatedRuleset] })))
    ),
    http.put(
      `https://api.github.com/repos/${repository.owner.name}/${repository.name}/rulesets/${rulesetId}`,
      async ({ request }) => {
        this.rulesetUpdate = await request.json()

        return new HttpResponse(null, { status: StatusCodes.OK })
      }
    )
  )
})

Given('the ruleset is removed from the config', async function () {
  this.server.use(
    http.get(
      `https://api.github.com/repos/${repository.owner.name}/${repository.name}/contents/${encodeURIComponent(
        settings.FILE_NAME
      )}`,
      ({ request }) => HttpResponse.arrayBuffer(Buffer.from(dump({ rulesets: [] })))
    ),
    http.delete(
      `https://api.github.com/repos/${repository.owner.name}/${repository.name}/rulesets/:rulesetId`,
      async ({ params }) => {
        this.removedRuleset = params.rulesetId

        return new HttpResponse(null, { status: StatusCodes.NO_CONTENT })
      }
    )
  )
})

Then('the ruleset is enabled for the repository', async function () {
  assert.deepEqual(this.createdRuleset, this.ruleset)
})

Then('the ruleset is updated', async function () {
  assert.deepEqual(this.rulesetUpdate, this.updatedRuleset)
})

Then('the ruleset is deleted', async function () {
  assert.equal(this.removedRuleset, rulesetId)
})
