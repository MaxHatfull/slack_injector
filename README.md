# slack_injector

Injects custom CSS into the Slack desktop app on macOS. The stock dark theme renders message bodies in a greyer colour (`--sk_primary_foreground`, 209,210,211) than sender names (`--dt_color-content-pry`, #f8f8f8). `slack.css` points message text at the brighter token so bodies match names.

## Install

```sh
echo 'alias slack="$HOME/dev/slack_injector/bin/slack"' >> ~/.zshrc
source ~/.zshrc
```

The alias shadows the `slack` rbenv gem shim; `command slack` still reaches the gem.

## Use

```sh
slack
```

Launches Slack with `--remote-debugging-port=9222` and starts `inject.mjs` in the background. If Slack is already running without the port, quit it and run `slack` again. Always launch from the terminal, not the Dock, or there is no port to attach to.

Edit `slack.css` and the change is re-injected live. Log: `inject.log`.

## How it works

```
bin/slack ─► open -a Slack --remote-debugging-port=9222
     │
     └─► node inject.mjs ──ws──► Slack (Target.setAutoAttach)
               │                   │ every page/window/reload
               │                   ▼
               └── slack.css ──► <style id="slack-contrast-css"> in <head>
```

`inject.mjs` connects to the Chrome DevTools Protocol endpoint, auto-attaches to every page target, registers the style via `Page.addScriptToEvaluateOnNewDocument` (so it survives reloads) and evaluates it immediately for already-loaded pages. It reconnects when Slack restarts and re-injects when `slack.css` changes. Needs Node 22+ for the built-in `WebSocket` and `fetch`.

## Why not patch app.asar

Slack ships with the `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` Electron fuses, asar hashes in `Info.plist`, and hardened-runtime Developer ID signing. Patching means ad-hoc re-signing (loses Keychain access) and is wiped by the next auto-update. The CDP route survives updates and leaves the bundle untouched.

## Caveats

- The debug port is localhost-only, but any local process can drive Slack through it while it is open.
- Selectors are Slack's internal class names and may change in an update. Find the new ones with a probe over CDP (see `probe.mjs`).

## Broader override

If more text needs lifting than message bodies, override the legacy variable instead of one selector. It feeds ~670 rules including borders and shadows, so it nudges more than text:

```css
.sk-client-theme--dark { --sk_primary_foreground: 248, 248, 248; }
```
