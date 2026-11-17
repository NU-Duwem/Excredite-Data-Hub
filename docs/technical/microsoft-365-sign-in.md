# "Sign in with email" (Microsoft 365) and company email for EPDH

**For:** Excredite's Microsoft 365 administrator and an EPDH admin.
**Time:** about 20 minutes.

**What this sets up:**
- **Sign in with email:** the EPDH login page has one button, **Sign in with email**. Behind the scenes it signs people in with their Excredite Microsoft 365 account and its usual multi-factor authentication, but the page never mentions Microsoft. There's no separate EPDH password. When IT disables someone's Microsoft account, they lose access to EPDH as well.
- **Company sender address:** password-reset and invitation emails come from an `@excredite.ng` address instead of Supabase's test mailer.

**Already done in EPDH:**
- **Listed accounts only:** an account can exist only for an address on the EPDH list (`public.allowed_accounts`). Today the list holds the five addresses below, and nothing else gets in: no other `@excredite.ng` address and no outside address. Adding someone in the Admin Panel puts them on the list. There's no self sign-up.
- **Linking to existing accounts:** a person's first sign-in attaches to their existing EPDH account through their email address. Their role, documents and history stay as they are.
- **Sign-in method:** Profile & Settings shows how each person signs in.

**Accounts:**

| Person | EPDH email | Role |
|---|---|---|
| Duwem Nwapi | duwem@excredite.ng | System Admin |
| Phillip Ekpo | phillip@excredite.ng | System Admin |
| Eyo Ekpo | eyo@excredite.ng | CEO |
| Osefan Anegbe | osefan@excredite.ng | Legal Team |
| Taiwo Odugbemi | taiwo@excredite.ng | Research Analyst |

Each person's Microsoft 365 address must be exactly the same as their EPDH email. If someone's Microsoft address is different (for example `taiwo.odugbemi@excredite.ng`), tell an EPDH admin before they sign in, so the EPDH email can be changed to match. Otherwise the sign-in won't find their account.

---

## Part 1: Register EPDH in Microsoft Entra ID (Microsoft 365 admin)

1. **Create the app registration.** Go to <https://entra.microsoft.com> → **Identity → Applications → App registrations → New registration**, and fill in:
   - **Name:** `EPDH – Excredite Electricity Data Hub`
   - **Supported account types:** **Accounts in this organizational directory only (Excredite only – Single tenant)**
   - **Redirect URI:** platform **Web**, address `https://bwxgqnagsuujigacgfes.supabase.co/auth/v1/callback`

   Then click **Register**.
2. **Copy two IDs** from the **Overview** page:
   - **Application (client) ID**
   - **Directory (tenant) ID**
3. **Create a client secret.** Go to **Certificates & secrets → Client secrets → New client secret**:
   - **Description:** `Supabase`
   - **Expires:** 24 months

   Copy the secret's **Value** straight away, because it's shown only once. Put a reminder in the calendar to renew it before it expires; when it expires, Microsoft sign-in stops working.
4. **Add the email claims.** Go to **Token configuration → Add optional claim → ID**:
   - tick **email** and **xms_edov**, then click **Add**;
   - accept the prompt to turn on the Microsoft Graph email permission.

   `xms_edov` tells EPDH that Microsoft has verified the email address. Without it, Supabase won't link the Microsoft sign-in to the existing EPDH account.
5. **Grant consent.** Go to **API permissions** and check that Microsoft Graph lists `email`, `openid`, `profile` and `User.Read`. Then click **Grant admin consent for Excredite**.
6. **Optional:** to choose who can use EPDH, open **Enterprise applications → EPDH → Properties**, set **Assignment required?** to **Yes**, then add the five staff (or a group) under **Users and groups**.

**Send to the EPDH admin securely,** for example in person or through a password manager, not by plain email or chat:
- the Application (client) ID;
- the Directory (tenant) ID;
- the secret Value.

---

## Part 2: Turn it on in Supabase (EPDH admin)

1. **Set up the Azure provider.** In the Supabase dashboard for the EPDH project, go to **Authentication → Sign In / Providers → Azure** and enter:
   - **Enable Sign in with Azure:** on;
   - **Application (client) ID:** from Part 1;
   - **Secret Value:** from Part 1;
   - **Azure Tenant URL:** `https://login.microsoftonline.com/<Directory (tenant) ID>`. Using the tenant URL is what limits sign-in to Excredite's directory.

   Then click **Save**.
2. **Set the addresses.** Go to **Authentication → URL Configuration**:
   - **Site URL:** the app's address once it's deployed (`http://localhost:3000` until then);
   - **Redirect URLs:** add `http://localhost:3000/auth/callback`, and also `https://<app domain>/auth/callback` once deployed.
3. **Close self sign-up.** Go to **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Then only people an EPDH admin has added can get in. Anyone else sees "This email address does not have access to EPDH". (The database's allowed list already enforces this; this setting is a second lock.)
4. **Show the button.** Add this line to `frontend/.env.local` (and to the hosting settings once deployed), then restart the app:

   ```env
   NEXT_PUBLIC_MICROSOFT_SIGN_IN=true
   ```

   The login page then shows only the **Sign in with email** button; the password form disappears.
5. **Test it.** Click **Sign in with email** as one person and sign in on the Microsoft screen that follows. Then open **Profile & Settings**: **Sign-in method** should read "Excredite work email or Email and password", and the role and history should be unchanged.

6. **Retire old passwords.** Once all five people have signed in successfully with the button, run this in the Supabase **SQL Editor**. It replaces everyone's old EPDH password with a random one that nobody knows:

   ```sql
   UPDATE auth.users
   SET encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'base64'), extensions.gen_salt('bf'))
   WHERE lower(email) IN (SELECT email FROM public.allowed_accounts);
   ```

   After that, the only ways in are **Sign in with email** and, once, a temporary password. **Leave Supabase's Email sign-in setting switched on:** temporary passwords need it to start the session, even though nobody uses a normal password any more.

**Adding someone new later:** an EPDH admin uses **Add user** in the **Admin Panel** with the person's exact Microsoft 365 address. That puts the address on the allowed list and shows a **temporary password** once. Give it to the person in person or by phone. It works for their **first sign-in only**, for 3 days; on the login page they choose **First time? Use a temporary password**. After that they use **Sign in with email**. If it expires, or they mistype it 5 times, click **Issue temporary password** in their details to make a new one; the old one stops working.

---

## Part 3: Send EPDH emails from `@excredite.ng`

Supabase sends password-reset, invitation and confirmation emails. Its built-in mailer is for testing only:
- it delivers only to a few addresses;
- it has a very low hourly limit;
- emails come from a Supabase address.

**Why not Microsoft 365's own mail server:** Supabase can only send through a mail server using a username and password. Microsoft has been retiring username-and-password ("Basic auth") sending from Microsoft 365, so that route is unreliable. A sending service is the dependable option instead. Brevo, Resend and Postmark all have free or low-cost tiers and can send as `noreply@excredite.ng`.

1. **Create an account** with the sending service, and add the domain `excredite.ng`.
2. **Add DNS records.** The service lists records to add wherever excredite.ng's DNS is managed (often the domain registrar, or Microsoft 365 if it hosts the DNS):
   - **SPF:** add the service to the existing `v=spf1 … include:spf.protection.outlook.com …` record. **Don't replace that record**, or Microsoft 365 mail will break;
   - **DKIM:** usually one or two CNAME or TXT records;
   - **DMARC:** if excredite.ng has none yet, start with `v=DMARC1; p=none; rua=mailto:<your address>`.
3. **Wait for verification.** It usually takes minutes, but can take up to a day.
4. **Create the SMTP login.** In the service, create SMTP credentials (or an API key used as the SMTP password).
5. **Enter them in Supabase.** Go to **Authentication → Emails → SMTP Settings**, turn on **Enable custom SMTP**, and enter:
   - **Sender email:** `noreply@excredite.ng`
   - **Sender name:** `Excredite Data Hub`
   - **Host, port and username:** from the service. Use port 587.
   - **Password:** from the service. Type it into Supabase yourself; never paste it into chat or email.
6. **Raise the email limit.** In **Authentication → Rate Limits**, raise the email limit to about 30 per hour.
7. **Test it.** Use **Forgot password?** on the login page and check that the email arrives from `noreply@excredite.ng`.

Once Part 3 is done, EPDH's developer can restyle the email templates (reset, invite, confirm) in Excredite's branding.

People who use **Sign in with email** rarely need these emails. They still matter for anyone using a password and for admin invitations.
