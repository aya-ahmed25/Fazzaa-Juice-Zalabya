# Fazzaa Menu

Static Arabic menu and order-management dashboard for Fazzaa.

## Publish with GitHub Pages

1. Create a **public** GitHub repository.
2. Upload the contents of this folder to the repository's top level.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Open the published site URL. The menu is at `/`; the admin dashboard is `/order-admin.html`.

The project is static HTML, CSS, and JavaScript; no build command is required. Supabase already contains the order database and catalog. Do not rerun the original database migration if the tables already exist.

The Supabase publishable key in `order-config.js` is intended for browser use. Never put a Supabase `service_role` or secret key in this repository.

See `SETUP-ORDERS.md` for Supabase setup details.
