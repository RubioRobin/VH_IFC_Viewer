# Deployment Fix Instructions

The deployment failed because the settings in the **Render** and **Vercel** dashboards are still pointing to the old folder names (`Backend` and `Webviewer`). Since I cannot change these dashboard settings from here, you need to update them manually.

## 1. Fix Render (Backend)

1.  Go to your **Render Dashboard**.
2.  Select your backend service (`vh-ifc-backend`).
3.  Go to **Settings** -> **Build & Deploy**.
4.  Update the following fields:

| Setting | **Current Value (INVALID)** | **New Value (CORRECT)** |
| :--- | :--- | :--- |
| **Build Command** | `cd Backend && npm install` | `cd src/backend && npm install` |
| **Start Command** | `node server.js` | `cd src/backend && node app.js` |
| **Root Directory** | *(likely empty or Backend)* | `.` (or leave empty) |

5.  Click **Save Changes**.
6.  Click **Manual Deploy** -> **Clear Cache & Deploy** to restart the build.

## 2. Fix Vercel (Frontend)

1.  Go to your **Vercel Dashboard**.
2.  Select your project (`vh-ifc-viewer` or similar).
3.  Go to **Settings** -> **General**.
4.  Find the **Root Directory** section.
5.  Change it from `Webviewer` to:
    *   `src/frontend`
6.  Click **Save**.
7.  Go to **Deployments** tab and redeploy the latest commit.
