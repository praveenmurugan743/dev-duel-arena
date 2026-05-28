## Goal
Sync the Lovable workspace with the latest commits you pushed to the `dev` branch on GitHub, replacing the workspace's current state.

## Why this isn't a code change
Lovable doesn't run `git pull` for you from chat — the sync happens through the GitHub integration in the editor. So this plan is a set of UI steps for you to run, not a file edit.

## Steps for you to do in Lovable

1. **Confirm you're on the `dev` branch** in Lovable
   - Top of the editor → branch switcher → make sure it shows `dev` (not `main`, not an `edit/...` branch).
   - If the branch switcher isn't visible, enable **Account Settings → Labs → GitHub Branch Switching**.

2. **Pull the latest commits from GitHub**
   - Open the **GitHub** menu in the editor (top bar).
   - Click **"Pull latest from GitHub"** (or **"Sync with GitHub"**).
   - This fetches `origin/dev` and fast-forwards the Lovable workspace to match it.

3. **If Lovable warns about local changes / conflicts**
   - Since you said "replace workspace with GitHub version", choose the **"Discard local changes"** / **"Use GitHub version"** option when prompted.
   - Any uncommitted Lovable edits in this workspace will be lost — that's the intended outcome here.

4. **Verify**
   - Open a file you changed on GitHub and confirm your fix is present.
   - The preview will rebuild automatically once the sync finishes.

## What I will do after you sync
Nothing automatic — once you've pulled, just send the next request (e.g. "continue with X") and I'll work on top of your updated `dev` branch.

## Notes
- I can't trigger the GitHub pull from chat; it has to be initiated from the editor UI so Lovable can manage the workspace state safely.
- If the **"Pull latest"** option is missing, your GitHub connection may have drifted — reconnect via **GitHub → Manage connection** and try again.
