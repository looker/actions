import * as semver from "semver"

import { Action } from "./action"

export const actions: Action[] = []

export function addAction(action: Action) {
  actions.push(action)
}

export async function allActions(opts?: { lookerVersion?: string | null }) {
  const whitelistNames = process.env.ACTION_WHITELIST
  let filtered: Action[]
  if (typeof whitelistNames === "string" && whitelistNames.length > 0) {
    const whitelist = whitelistNames.split(",")
    filtered = actions.filter((i) => whitelist.indexOf(i.name) !== -1)
  } else {
    filtered = actions
  }
  if (opts && opts.lookerVersion) {
    filtered = filtered.filter((a) =>
      semver.gte(opts.lookerVersion!, a.minimumSupportedLookerVersion),
    )
  }
  return filtered
}

export async function findAction(id: string, opts?: {lookerVersion?: string | null}) {
  const all = await allActions(opts)
  const matching = all.filter((i) => i.name === id)
  if (matching.length === 0) {
    throw "No action found."
  }
  return matching[0]
}

export async function findExtendedAction(id: string, opts?: {lookerVersion?: string | null}) {
  const action = await findAction(id, opts)
  return action.extendedAction ? action : null
}
