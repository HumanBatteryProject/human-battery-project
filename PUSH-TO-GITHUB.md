# Push this to GitHub

The repo is already initialized with one commit on `main`. You only need to
create the remote and push.

## 1. Create an empty repo on GitHub

github.com → New repository.

- Name: `human-battery-project`
- **Private**
- Do **not** add a README, .gitignore, or licence — this repo already has them,
  and adding them creates a conflict on the first push.

## 2. Push

From this folder:

```bash
git remote add origin git@github.com:YOURNAME/human-battery-project.git
git push -u origin main
```

If you use HTTPS instead of SSH:

```bash
git remote add origin https://github.com/YOURNAME/human-battery-project.git
git push -u origin main
```

## 3. Connect Cloudflare Pages

Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pick the repo.

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `public` |

Every push to `main` now deploys automatically.

## 4. Everything else

See `README.md` for environment variables, the Supabase migrations, and the
pre-launch checklist.

---

## A note on keeping it private

`public/portal/config.js` ships with placeholder values and needs your real
Supabase URL and anon key. The anon key is designed to be exposed in the
browser — row-level security is what protects the data — so committing it is
not a security problem.

The `service_role` key is different. It bypasses row-level security entirely.
It belongs only in Cloudflare's environment variables, never in a file in this
repo. The repo was scanned before this commit and contains no real keys.
