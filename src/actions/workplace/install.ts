const qs = require("qs")
const request = require("request")

// ported from https://github.com/jokr/workplace-demo-authentication
export function installWorkplace(req: any, res: any) {
  if (!req.query.code) {
    return res
      .status(400)
      .render("workplace/error", { message: "No code received." })
  }

  const baseURL = (
    process.env.FACEBOOK_GRAPH_URL
    ? process.env.FACEBOOK_GRAPH_URL
    : "https://graph.facebook.com"
  )

  const tokenQueryString = qs.stringify({
    client_id: process.env.WORKPLACE_APP_ID,
    client_secret: process.env.WORKPLACE_APP_SECRET,
    redirect_uri: process.env.WORKPLACE_APP_REDIRECT,
    code: req.query.code,
  })
  request(
    baseURL + "/oauth/access_token?" + tokenQueryString,
    (tokenErr: any, tokenResponse: any, tokenBody: any) => {
      try {
        if (tokenErr) {
          return res
            .status(500)
            .render("workplace/error", {
              message: "Error when sending request for access token.",
            })
        }
        const parsedTokenBody = JSON.parse(tokenBody)
        if (tokenResponse.statusCode !== 200) {
          return res
            .status(500)
            .render("workplace/error", {
              message: "Access token exchange failed.",
              code: JSON.stringify(parsedTokenBody.error),
            })
        }

        const accessToken = parsedTokenBody.access_token
        if (!accessToken) {
          return res
            .status(500)
            .render("workplace/error", {
              message: "Response did not contain an access token.",
            })
        }

        return res.render("workplace/success", { accessToken })

      } catch (accessTokenRequestError) {
        // console.error(accessTokenRequestError)
        res.render("workplace/error", {
          message: "Facebook Graph API returned an error.",
        })
      }
    },
  )

}
