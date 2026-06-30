# OAuth providers

The OAuth sidebar owns shared provider credentials so feature pages never duplicate client
IDs, secrets, redirect URLs, or tokens. `providers/twitch.js` implements Twitch's loopback
implicit and authorization-code flows. Secrets and user tokens are stored only in local
AppData settings; none are committed to this folder.

Future OAuth providers belong in `providers/` and should expose their redirect URL and a
login function through main-process IPC.
