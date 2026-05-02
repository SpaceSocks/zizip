# Cosmic Zip Vultr Deployment

This deploys the static browser game to the Vultr Ubuntu server at `45.63.67.147`
and serves it with Nginx at `cosmiczip.net`.

## 1. Cloudflare DNS

In Cloudflare for `cosmiczip.net`, add:

- `A` record: `@` -> `45.63.67.147`
- `A` record: `www` -> `45.63.67.147`

For the first SSL setup, set both records to **DNS only**. After Certbot succeeds,
you can turn the proxy back on if you want Cloudflare in front.

Recommended Cloudflare SSL mode after Certbot: **Full (strict)**.

## 2. Firebase Auth Settings

Firebase Console > Authentication > Settings > Authorized domains:

- `cosmiczip.net`
- `www.cosmiczip.net`
- `criterion-valve-ordering-biology.trycloudflare.com`
- `127.0.0.1`

Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs:

Add this authorized redirect URI:

```text
https://cosmiczip.net/__/auth/handler
```

Firebase Auth > Sign-in method > Google:

- Enable Google
- Set support email
- Save

## 3. First Server Setup

From PowerShell on your PC:

```powershell
.\deploy\deploy-vultr.ps1
```

Then SSH into the server:

```powershell
ssh root@45.63.67.147
```

On the server, run:

```bash
bash /tmp/setup-vultr-nginx.sh cosmiczip.net www.cosmiczip.net your-email@example.com
```

Use your real email for Let's Encrypt renewal notices.

## 4. Future Deploys

After code changes:

```powershell
.\deploy\deploy-vultr.ps1
```

If Nginx config changes:

```bash
bash /tmp/setup-vultr-nginx.sh cosmiczip.net www.cosmiczip.net your-email@example.com
```

## Notes

The Nginx config proxies `/__/auth/` to Firebase's auth helper. That allows the
Firebase web SDK to use `cosmiczip.net` as `authDomain`, which makes Google
sign-in look cleaner than `zipzip-d8d69.firebaseapp.com`.
