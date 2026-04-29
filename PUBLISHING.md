# Publishing PyGreenSense

This repository is prepared to publish a VS Code extension package with `vsce`.

## Before Publishing

1. Confirm that `publisher` in `package.json` matches your Visual Studio Marketplace publisher ID.
2. Confirm that `version` in `package.json` is the version you want to release.
3. Confirm that `README.md`, `CHANGELOG.md`, `LICENSE`, `media/icon.png`, `dist/extension.js`, and `python/requirements.txt` are the only user-facing package files needed.

## Package Locally

```bash
npm run package
vsce package
```

The package command creates a `.vsix` file that can be installed locally for final testing.

## Publish To Visual Studio Marketplace

```bash
vsce login <publisher-id>
vsce publish
```

Users of Microsoft VS Code can then find and install the extension from the Extensions view.

## Publish To Open VSX

```bash
npx ovsx create-namespace <publisher-id> -p <open-vsx-token>
npx ovsx publish -p <open-vsx-token>
```

Open VSX is commonly used by VSCodium and other community builds.
