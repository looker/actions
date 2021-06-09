import "dotenv/config"

import * as crypto from "crypto"
import * as keys from "../src/server/api_key"

/* tslint:disable no-console */
console.log("Here's a valid API key:")
console.log(keys.fromNonce(crypto.randomBytes(32).toString("hex")))
console.log("\nThis key will be valid until ACTION_HUB_SECRET is changed.")
