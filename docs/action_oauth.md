# Looker Action Oauth Flow

To build an oauth enabled action, we use the same steps for building a normal actions except with a few extra calls and parameters. 
For the Looker supported Action Hub you can extend an OAuthAction instead of an Action to get some extra  help and set a bool that will help a developer know which oauth methods are needed.
For every oauth/state enabled action there is a per-user, per-action state stored in Looker, so each action and user combination will have an independent oauth event.

### General Flow 

In general there is a common flow for creating actions - which is usually a `/form` request followed by a `/execute` request.
For oauth, the `/form` should have a way to see if the the user is authenticated with the target source. If the user is already authenticated then the action should return a normal form in accordance to whatever the `/execute` request needs
If the user is not authenticated, the action should send back a link that will initialize an oauth flow. 

### Action Hub Oauth Link and initial Authentication Redirect

If an action returns `uses_oauth: true` in its definition, then the action will be sent a one time use `state_url` in every `/form` request from Looker. The `state_url` is a special one time use url for the source Looker that can be used to set a user's state for a given action.
If the user is not authenticated with the endpoint, the form returned should contain a form_field of type `oauth_link` that goes to the `/oauth` endpoint of an action. The `state_url` should be encrypted and saved as a `state` param in the `oauth_url` that is returned.
```json
{
        "name": "login",
        "type": "oauth_link",
        "label": "Log in",
        "description": "Oauth Link",
        "oauth_url": "ACTIONHUB_URL/actions/myaction/oauth?state=encrypted_state_url"
}
```

The `/oauth` endpoint (at least in current examples) is used to redirect the user to the authentication server. The `/oauth` endpoint constructs the redirect in the `oauthUrl(...)` method on an oauth action. An example can be seen in [Dropbox OauthUrl](https://github.com/looker/actions/blob/2d38b8aab8d7596f385c33c815699180eabbde86/src/actions/dropbox/dropbox.ts#L111-L121).
In addition the `state` param containing that encrypted `state_url` should be passed to the 

### Action Hub Redirect from Authentication server and saving state

In the `/oauth` endpoint, a redirect_uri for the ActionHub is also created and passed to the action's `oauthUrl(...)` method. This redirect uri is of the form `/actions/myaction/oauth_redirect`. This redirect_uri is the endpoint that will be used if the authentication returns a result. This endpoint will call the `oauthFetchInfo(...)` method that should be implemented by an OauthAction. This method should extract the necessary information and attempt to receive or save any state or auth received from the authentication server.
Once the desired state is parsed, the `state` that should still be passed back should decrypt the encrypted `state_url` and use it to post state back to Looker. The next time a request is made by the user to that specific action, the newly saved state will be sent up to the action hub.

## Action State

The `state_url` is not the only way to save state for an action/user. `state` can be returned as part of the response from an `/execute` or `/form` request. If any state is returned as part of these requests, Looker will overwrite any previous state it had stored for that user/action.
