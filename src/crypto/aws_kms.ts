import * as AWS from "aws-sdk"
import * as b64 from "base64-url"
import * as winston from "winston"
import {CryptoBase} from "./crypto_base"

export class AwsKms extends CryptoBase {
  async encrypt(plaintext: string) {
    if (plaintext == null) {
      throw "Plaintext was empty"
    }
    if (process.env.KMS_KEY_ID === undefined) {
      throw "No KMS_KEY_ID present"
    }
    const creds = new AWS.SharedIniFileCredentials({profile: "actionhub-dev-oauth-console"})
    AWS.config.update({ region: "us-east-1", credentials: creds})
    const kms = new AWS.KMS()
    const params = {
      KeyId: process.env.KMS_KEY_ID,
      Plaintext: plaintext,
    }

    return new Promise<string>((resolve, reject) => {
      kms.encrypt(params, ((err, data) => {
        if (err != null && err.message) {
          winston.info(`Error: ${err.message}`)
          reject(err.message)
        }
        if (data && data.CiphertextBlob) {
          resolve(b64.encode(data.CiphertextBlob.toString()))
        }
        reject("CiphertextBlob was empty")
      }))
    })
  }

  async decrypt(ciphertext: string) {
    const creds = new AWS.SharedIniFileCredentials({profile: "actionhub-dev-oauth-console"})
    AWS.config.update({ region: "us-east-1", credentials: creds})
    const kms = new AWS.KMS()
    const params = {
      CiphertextBlob: ciphertext,
    }

    return new Promise<string>((resolve, reject) => {
      kms.decrypt(params, ((err, data) => {
        if (err != null && err.message) {
          winston.info(`Error: ${err.message}`)
          reject(err.message)
        }
        if (data && data.Plaintext) {
          resolve(data.Plaintext.toString())
        }
        reject("Plaintext was empty")
      }))
    })
  }
}
