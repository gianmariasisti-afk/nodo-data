#!/bin/sh
# Xcode Cloud runs this right after it clones the repo, before it resolves Swift packages.
# The iOS project needs two things that are not in git: app/node_modules (the Capacitor plugins that
# CapApp-SPM/Package.swift points to) and the web app copied into the project (app/www, App/App/public).
# This does what `npm install && npm run sync` does on the Mac.
set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi
node --version
npm --version

cd "$CI_PRIMARY_REPOSITORY_PATH/app"
npm ci
node scripts/build-www.mjs
npx cap sync ios

# Xcode Cloud refuses to resolve Swift packages by itself: it wants Package.resolved in the project. One is in git
# (capacitor-swift-pm pinned to the version in app/package.json). Resolving here as well rewrites it in the format
# this Xcode expects, so the build does not depend on the committed file being current. Not fatal if it fails.
cd "$CI_PRIMARY_REPOSITORY_PATH/app/ios/App"
xcodebuild -resolvePackageDependencies -project App.xcodeproj || echo "Package resolution in ci_post_clone failed; the build uses the committed Package.resolved"
