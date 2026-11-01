# Releasing the personal fork

Version 1.1.0 adds features to 1.0.2 without a deliberate breaking upgrade, so a minor version is appropriate. Reserve 2.0.0 for an incompatible redesign or migration. Android versionCode must increase independently of the display version. The ABI suffixes are calculated in app/build.gradle.

## Prepare

1. Keep versionName and package.json / package-lock.json aligned. This release uses 1.1.0 and base versionCode 100100 (ARM64 APK: 10010002).
2. Run JS/type/lint/dependency checks and build a release. Test the final signed ARM64 APK on a real device, including both themes, save/edit, wake, widget, tile and backup restore.
3. In Android Studio open android/, then Generate Signed App Bundle / APK, APK, your existing personal keystore, release. Keep the same certificate used by your previous personal build. Never commit signing keys or passwords.
4. Verify signatures using Android SDK apksigner verify --verbose --print-certs. The Gradle filename may retain -unsigned when signing through the IDE; rename only after verification.
5. Stage only source/config/docs. Commit and push the final release source to personal. Do not commit APK/AAB files, build folders, Android Studio metadata, private keys or local SDK paths. Gradle wrapper files and package-lock.json belong in Git.

## Publish manually

The CD workflow is manual-only (workflow_dispatch), so creating a version tag does not start a competing release build. It accepts an existing version tag, checks the package version, and produces a draft only. To dispatch it from GitHub, this workflow definition must also be on the repository default branch (for example by making personal the default). Do not run it unless its production signing secrets are configured with the same certificate.

1. In GitHub Releases, create a draft with tag v1.1.0 targeting the final personal commit. Do not tag master.
2. Use docs/releases/v1.1.0.md for the title and notes. Update testing claims to match completed physical tests.
3. Attach the final signed APKs. ARM64 is sufficient for Pixel 9; attach the other verified architectures if distributing broadly. Do not attach keystores or passwords. GitHub provides source archives automatically.
4. Generate SHA256SUMS.txt from the final signed/renamed files, not the unsigned build. PowerShell: Get-FileHash -Algorithm SHA256 <apk-path>.
5. Review the draft and publish. For unfinished testing, use a distinct beta version/tag and select pre-release instead.

The local release-artifacts/ directory is ignored. Its checksums refer to unsigned build inputs and must be regenerated after signing. Publishing, pushing commits/tags and changing the default branch are separate operations.

## Contributor attribution

GitHub's repository contributor list uses the default branch, currently master. The personal commits are authored by lucabnt with the GitHub noreply address; viewing personal does not change the contributor list's basis. If personal is the maintained branch, the owner can choose it in Settings → General → Default branch. This does not merge history or change upstream. Profile contribution squares have separate fork eligibility rules.
