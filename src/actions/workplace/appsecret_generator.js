// helper to generate appsecret_proof query string for postman testing
// CLI USAGE:
// $ ACCESS_TOKEN=... APP_SECRET=... node src/actions/workplace/appsecret_generator.js
// Mac: pipe to pbcopy to place query params on clipboard
// $ ACCESS_TOKEN=... APP_SECRET=... node src/actions/workplace/appsecret_generator.js | pbcopy

const crypto = require("crypto")
const qs = require('querystring')

if (!process.env.ACCESS_TOKEN) throw 'process.env.ACCESS_TOKEN'
if (!process.env.APP_SECRET) throw 'process.env.APP_SECRET'

const accessToken = process.env.ACCESS_TOKEN
const secret = process.env.APP_SECRET

const appsecretTime = Math.floor(Date.now() / 1000)
const appsecretProof = crypto
    .createHmac("sha256", secret)
    .update(accessToken + "|" + appsecretTime)
    .digest("hex")

console.log(qs.stringify({
    appsecret_time: appsecretTime,
    appsecret_proof: appsecretProof,
}))
