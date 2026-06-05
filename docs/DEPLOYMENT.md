# Deployment guide

One-time setup to deploy the three tiers via GitHub Actions:

- **API** → Cloud Run (container in Artifact Registry)
- **Web** → Cloud Storage bucket (static website)
- **DB** → Supabase (`supabase db push`)

Auth from GitHub to GCP uses **Workload Identity Federation** (keyless). The
workflows are in `.github/workflows/`. After setup, pushing to `main` deploys the
changed tier automatically; you can also run each workflow via *Run workflow*.

> Until you complete this setup, the deploy jobs **skip** themselves (they are
> gated on the `GCP_PROJECT_ID` / `SUPABASE_PROJECT_REF` repository variables), so
> CI stays green and no deploy fails for missing credentials.

> Replace placeholders in `ALL_CAPS`. Commands assume the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install)
> and the [Supabase CLI](https://supabase.com/docs/guides/cli) are installed and
> you are authenticated (`gcloud auth login`).

---

## 0. Names used below

```bash
export PROJECT_ID=my-gcp-project
export REGION=us-central1
export AR_REPO=ticketing
export RUN_SERVICE=ticketing-api
export WEB_BUCKET=ticketing-web-myorg          # must be globally unique
export SA_NAME=gh-deployer
export SA_EMAIL=$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com
export GITHUB_REPO=YOUR_GH_USER/YOUR_REPO       # owner/repo

gcloud config set project "$PROJECT_ID"
```

---

## 1. Supabase (cloud)

1. Create a project at https://supabase.com (note the **project ref**, e.g. `abcd1234`).
2. Get a **personal access token**: Account → Access Tokens (`SUPABASE_ACCESS_TOKEN`).
3. Note the **database password** you set when creating the project.
4. From the dashboard (Settings → API) note:
   - **Project URL** → used as `SUPABASE_URL` (API) and `VITE_SUPABASE_URL` (web)
   - **publishable / anon key** → `VITE_SUPABASE_ANON_KEY` (web)
   - **secret / service-role key** → stored in GCP Secret Manager (step 3)

> Migrations are applied by the `deploy-db` workflow. `seed.sql` is **not** run in
> the cloud — it is local demo data only.

---

## 2. Enable GCP APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

---

## 3. Artifact Registry + Secret Manager

```bash
# Docker repository for the API image
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker --location="$REGION"

# Store the Supabase service-role key as a secret (consumed by Cloud Run)
printf '%s' 'SUPABASE_SERVICE_ROLE_KEY_VALUE' | \
  gcloud secrets create supabase-service-role-key --data-file=-
```

---

## 4. Web bucket (static site)

```bash
gcloud storage buckets create "gs://$WEB_BUCKET" \
  --location="$REGION" --uniform-bucket-level-access

# Serve as a website; index.html doubles as the SPA fallback for deep links
gcloud storage buckets update "gs://$WEB_BUCKET" \
  --web-main-page-suffix=index.html --web-error-page=index.html

# Make objects publicly readable
gcloud storage buckets add-iam-policy-binding "gs://$WEB_BUCKET" \
  --member=allUsers --role=roles/storage.objectViewer
```

The site is then served at `https://storage.googleapis.com/$WEB_BUCKET/index.html`.
For a clean URL/HTTPS on a custom domain, put an external HTTPS Load Balancer or
Cloud CDN in front of the bucket (out of scope here).

---

## 5. Deployer service account + roles

```bash
gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub deployer"

for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/storage.admin \
  roles/secretmanager.secretAccessor \
  roles/iam.serviceAccountUser ; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" --role="$ROLE"
done
```

---

## 6. Workload Identity Federation (keyless GitHub → GCP)

```bash
# Pool + GitHub OIDC provider (restricted to your repository)
gcloud iam workload-identity-pools create github-pool \
  --location=global --display-name="GitHub pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool \
  --display-name="GitHub provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
export WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider"

# Allow the repo to impersonate the deployer SA
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$GITHUB_REPO"

echo "GCP_WIF_PROVIDER=$WIF_PROVIDER"
echo "GCP_SERVICE_ACCOUNT=$SA_EMAIL"
```

---

## 7. GitHub configuration

In the repo: **Settings → Secrets and variables → Actions**.

### Variables (non-secret)

| Name                     | Example / source                                  |
| ------------------------ | ------------------------------------------------- |
| `GCP_PROJECT_ID`         | `my-gcp-project`                                  |
| `GCP_REGION`             | `us-central1`                                      |
| `GAR_REPOSITORY`         | `ticketing` (Artifact Registry repo)              |
| `CLOUD_RUN_SERVICE`      | `ticketing-api`                                    |
| `GCS_BUCKET`             | `ticketing-web-myorg`                             |
| `SUPABASE_URL`           | Supabase Project URL (used by the API at runtime) |
| `WEB_ORIGIN`             | Public web URL, used for the API's CORS allowlist |
| `VITE_API_URL`           | The Cloud Run service URL                          |
| `VITE_SUPABASE_URL`      | Supabase Project URL                              |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key                     |
| `SUPABASE_PROJECT_REF`   | Supabase project ref                              |

### Secrets

| Name                     | Source                                            |
| ------------------------ | ------------------------------------------------- |
| `GCP_WIF_PROVIDER`       | `WIF_PROVIDER` printed in step 6                  |
| `GCP_SERVICE_ACCOUNT`    | `$SA_EMAIL` (the deployer SA)                     |
| `SUPABASE_ACCESS_TOKEN`  | Supabase personal access token                    |
| `SUPABASE_DB_PASSWORD`   | Supabase database password                        |

> The service-role key is **not** a GitHub secret — it lives in GCP Secret Manager
> (step 3) and is mounted into Cloud Run by `deploy-api.yml`.

---

## 8. First deploy

Order matters the first time:

1. **DB** — run the *Deploy DB* workflow (or push a migration change) so the schema
   exists.
2. **API** — run *Deploy API*. Copy the printed Cloud Run URL into the `VITE_API_URL`
   and `WEB_ORIGIN` variables.
3. **Web** — run *Deploy Web* so the bundle is built against the real API URL.

Re-run *Deploy API* if you changed `WEB_ORIGIN` after the first API deploy (CORS).

### Verify

```bash
curl "$(gcloud run services describe $RUN_SERVICE --region $REGION --format='value(status.url)')/health"
# {"status":"ok",...}
```

Open the web URL, sign up / sign in, and create a project + tickets.

---

## 9. Notes

- **CORS**: the API only allows the origin(s) in `WEB_ORIGIN`. Use a comma-separated
  list for multiple origins.
- **Rollback**: Cloud Run keeps revisions — `gcloud run services update-traffic
  $RUN_SERVICE --to-revisions=PREVIOUS=100`.
- **Costs**: Cloud Run scales to zero; the bucket and Supabase free tier are minimal.
