# Releasing AwakeOnLANMobile

The maintained branch and default branch of **lucabnt/AwakeOnLANMobile** is `main`. This is the fork; the upstream repository is nellogan/AwakeOnLANMobile. The existing `master` branch is preserved. No pull request to upstream is needed to publish this fork.

## Version 1.1.0

Use tag **v1.1.0**, display version **1.1.0**, and base Android versionCode **100100**. ABI-specific codes are 10010001 (ARMv7), 10010002 (ARM64), 10010003 (x86), and 10010004 (x86_64). This is a minor feature release relative to 1.0.2; no 2.0 version is needed.

Release APKs must match the latest application source, including the header safe-area fix, broadcast fallback, Wake toast and repository links in App Info. Rebuild and sign again after any application-source change; documentation-only changes do not require a rebuild. App Info links directly to the repository, independently of branch names. Reuse the maintainer signing certificate for updates and verify signatures, ZIP alignment and payload identity before distribution.

Distribution package: `release-artifacts/1.1.0/signed/` (ignored by Git).

## 1. Final phone check

Install the signed `awakeonlanmobile-arm64-v8a-1.1.0.apk` on Pixel 9. Reuse the existing signing key to update the existing test installation without uninstalling. Verify header/menu in both themes, Wake, widget/tile, save/edit, and backup restore. Status requires the actual PC IP in Status IP when Wake targets broadcast. Packet submission does not prove successful boot.

If application code changes, rebuild and sign again using Android Studio → Generate Signed App Bundle / APK → APK → existing maintainer keystore → release. Keep keys and passwords outside Git. Re-verify every APK using Android SDK `apksigner verify --verbose --print-certs` and `zipalign -c -P 16 4`. Rename `-unsigned` only after signature validation. Recompute checksums after signing and final renaming.

## 2. Commit and push release documentation

Only source/config/docs belong in Git. Do not commit APKs, build directories, Android Studio metadata, private signing keys or SDK paths. The Gradle wrapper and package-lock.json do belong in Git.

Review the prepared changes, then run from the repository root:

```sh
git diff --check
git diff --stat
git add README.md docs/RELEASING.md docs/technical-notes.md docs/releases/v1.1.0.md .github/workflows/CI.yml .github/workflows/CD.yml
git commit -m "chore: align main branch references and prepare v1.1.0 release"
git push origin main
```

The local branch already tracks origin/main. The branch rename and default-branch update are complete; the commands above publish only the remaining documentation/workflow changes. Do not force-push. Wait for CI on main and resolve any failure before publishing.

## 3. Create the GitHub release

Open https://github.com/lucabnt/AwakeOnLANMobile/releases/new .

- Tag: **v1.1.0**, create a new tag.
- Target: **main**, at the final pushed release commit.
- Title: **v1.1.0 — Widgets, encrypted backups and refreshed design**.
- Description: copy `docs/releases/v1.1.0.md` (omit its first heading if used as the release title).
- Attach the four signed APKs and `SHA256SUMS.txt` from `release-artifacts/1.1.0/signed/`.
- Select latest release for the tested stable release; leave pre-release unchecked.
- Save as draft, review filenames/notes, then Publish release.

GitHub creates the source ZIP/tarball automatically. Do not attach unsigned APKs, private keys, passwords or the full local build folder. Never reuse an existing tag for different binaries; a subsequent published fix needs a new version/code/tag.

Alternatively, after committing and pushing main, create and push an annotated tag locally:

```sh
git tag -a v1.1.0 -m "AwakeOnLANMobile v1.1.0"
git push origin v1.1.0
```

Then select that existing tag in the release form. Choose either tag-creation method; do not repeat it if v1.1.0 already exists. No tag or release has been created during this preparation.

## Optional GitHub Actions build

CD is manual-only (`workflow_dispatch`), accepts an existing version tag, checks the package version and creates a draft only. It does not run automatically on tag push. The manual Android Studio package is sufficient; no GitHub signing secrets are needed for manual publication.

Only use the automated workflow after configuring the production environment secrets RELEASE_STORE_FILE_BASE64, RELEASE_STORE_PASSWORD, RELEASE_KEY_ALIAS and RELEASE_KEY_PASSWORD with the **same signing certificate**. Select the release tag as workflow input. Do not create a competing manual release with the same tag while that workflow runs.

## Contributors

GitHub's repository contributor list uses the default branch, now main. Commits authored with lucabnt's GitHub noreply address remain attributed; statistics may take time to refresh. Profile contribution squares have separate fork eligibility rules.

References: [GitHub branch renaming](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch), [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository), [Android app signing](https://developer.android.com/studio/publish/app-signing).
