# slack_injector

Injects custom CSS into the Slack desktop app on macOS without patching the app bundle. It attaches to Slack over the Chrome DevTools Protocol (CDP), so it survives Slack auto-updates and leaves code signing intact.

Put whatever CSS you want in `slack.css`. The bundled example fixes a dark-theme contrast niggle: message bodies render in a greyer colour (`--sk_primary_foreground`, 209,210,211) than sender names (`--dt_color-content-pry`, #f8f8f8), so it points message text at the brighter token.

## Requirements

- macOS with the Slack desktop app installed in `/Applications`
- Node 22 or newer (uses the built-in `WebSocket` and `fetch`)

## Install

```sh
git clone https://github.com/MaxHatfull/slack_injector.git
cd slack_injector
echo "alias slack=\"$PWD/bin/slack\"" >> ~/.zshrc
source ~/.zshrc
```

Any name works for the alias. If you already have a `slack` command on your `PATH` (the Slack CLI, a gem shim, etc.) the alias shadows it; `command slack` still reaches the original.

## Use

```sh
slack
```

Launches Slack with `--remote-debugging-port=9222` and starts `inject.mjs` in the background. If Slack is already running without the port, quit it and run `slack` again. Always launch from the terminal, not the Dock, or there is no port to attach to.

Edit `slack.css` and the change is re-injected live. Logs go to `inject.log` in the repo directory.

Set `SLACK_CDP_PORT` to use a port other than 9222.

## How it works

```
bin/slack ─► open -a Slack --remote-debugging-port=9222
     │
     └─► node inject.mjs ──ws──► Slack (Target.setAutoAttach)
               │                   │ every page/window/reload
               │                   ▼
               └── slack.css ──► <style id="slack-contrast-css"> in <head>
```

`inject.mjs` connects to the CDP endpoint, auto-attaches to every page target, registers the style via `Page.addScriptToEvaluateOnNewDocument` (so it survives reloads) and evaluates it immediately for already-loaded pages. It reconnects when Slack restarts and re-injects when `slack.css` changes.

## Why not patch app.asar

Slack ships with the `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` Electron fuses, asar hashes in `Info.plist`, and hardened-runtime Developer ID signing. Patching means ad-hoc re-signing (loses Keychain access) and is wiped by the next auto-update. The CDP route survives updates and leaves the bundle untouched.

## Caveats

- The debug port is localhost-only, but any local process can drive Slack through it while it is open.
- Selectors are Slack's internal class names and may change in an update. Find the new ones with a probe over CDP: `node probe.mjs` prints the computed colours for the example selectors, or pass a file containing a JavaScript expression to evaluate in the Slack page, e.g. `node probe.mjs my-probe.js`.

## Broader override

If more text needs lifting than message bodies, override the legacy variable instead of one selector. It feeds ~670 rules including borders and shadows, so it nudges more than text:

```css
.sk-client-theme--dark { --sk_primary_foreground: 248, 248, 248; }
```

## License

MIT. See `LICENSE`.
