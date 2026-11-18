import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { PRIMARY_ROLES } from '@/utils/roles';
import { AVATAR_BUCKET, isOwnAvatarPath } from '@/utils/avatars';
import { isCompanyEmail } from '@/utils/authRedirect';
import { generateTemporaryPassword, temporaryPasswordProblem, TEMP_PASSWORD_HOURS, unguessablePassword } from '@/utils/tempPassword';

const VALID_ROLES: readonly string[] = PRIMARY_ROLES;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helper: verify the caller is a power_admin
async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'power_admin') {
    return { error: 'Forbidden: Admin role required', status: 403 };
  }

  return { user, profile };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, targetUserId, value } = body;

    // Verify admin
    const auth = await verifyAdmin();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      // ============================================
      // CREATE USER
      // The role goes in app_metadata (server-only); the signup trigger reads
      // it from there, so a self-service signUp() can never pick its own role.
      // ============================================
      case 'create-user': {
        const { email, password, fullName, role } = body;
        if (!email) {
          return NextResponse.json({ error: 'email is required' }, { status: 400 });
        }
        // The admin may type a temporary password; otherwise one is generated.
        // Either way it works for the person's first sign-in only.
        const typed = typeof password === 'string' ? password : '';
        const problem = typed ? temporaryPasswordProblem(typed) : null;
        if (problem) {
          return NextResponse.json({ error: problem }, { status: 400 });
        }
        const temporaryPassword = typed || generateTemporaryPassword();
        const newRole = role || 'power_team';
        if (!VALID_ROLES.includes(newRole)) {
          return NextResponse.json({ error: `Invalid role: ${newRole}` }, { status: 400 });
        }

        // Only listed @excredite.ng addresses can hold an account
        // (18_allowed_accounts.sql). Adding someone puts them on the list.
        const cleanEmail = String(email).trim().toLowerCase();
        if (!isCompanyEmail(cleanEmail)) {
          return NextResponse.json({ error: 'Only @excredite.ng email addresses can be added.' }, { status: 400 });
        }
        const { error: listError } = await adminClient
          .from('allowed_accounts')
          .upsert({ email: cleanEmail, note: fullName || null }, { onConflict: 'email', ignoreDuplicates: true });
        if (listError) {
          return NextResponse.json({ error: `Could not allow this address: ${listError.message}` }, { status: 500 });
        }

        const { data: created, error } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password: unguessablePassword(), // nobody knows it: people sign in with work email or the temporary password
          email_confirm: true, // admin-created accounts are trusted
          user_metadata: { full_name: fullName || '' },
          app_metadata: { role: newRole },
        });
        if (error || !created.user) {
          return NextResponse.json({ error: error?.message || 'Could not create user' }, { status: 400 });
        }

        const { data: expiresAt, error: tempError } = await adminClient.rpc('issue_temporary_password', {
          p_user_id: created.user.id,
          p_password: temporaryPassword,
          p_created_by: auth.user.id,
          p_valid_hours: TEMP_PASSWORD_HOURS,
        });
        if (tempError) {
          return NextResponse.json({ error: `User created, but the temporary password failed: ${tempError.message}. Issue one from their details.` }, { status: 500 });
        }

        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_CREATE_USER',
          details: `Admin created user ${cleanEmail} with role ${newRole} and a one-time temporary password`,
        });

        return NextResponse.json({
          success: true,
          userId: created.user.id,
          message: `User ${cleanEmail} created.`,
          data: { email: cleanEmail, temporaryPassword, expiresAt },
        });
      }

      // ============================================
      // CHANGE ROLE
      // ============================================
      case 'set-role': {
        if (!targetUserId || typeof value !== 'string' || !VALID_ROLES.includes(value)) {
          return NextResponse.json({ error: 'targetUserId and a valid role are required' }, { status: 400 });
        }

        // Never leave the platform without an active admin.
        if (value !== 'power_admin') {
          const { data: target } = await adminClient.from('user_profiles').select('role').eq('id', targetUserId).single();
          if (target?.role === 'power_admin') {
            const { count } = await adminClient
              .from('user_profiles')
              .select('id', { count: 'exact', head: true })
              .eq('role', 'power_admin')
              .eq('is_active', true);
            if ((count ?? 0) <= 1) {
              return NextResponse.json({ error: 'This is the only active System Admin. Make someone else an admin first.' }, { status: 400 });
            }
          }
        }

        const { error } = await adminClient
          .from('user_profiles')
          .update({ role: value, updated_at: new Date().toISOString() })
          .eq('id', targetUserId);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        // Keep the auth record in step (server-only metadata).
        await adminClient.auth.admin.updateUserById(targetUserId, { app_metadata: { role: value } });

        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_SET_ROLE',
          details: `Admin changed role of user ${targetUserId} to ${value}`,
        });

        return NextResponse.json({ success: true, message: 'Role updated.' });
      }

      // ============================================
      // ISSUE A ONE-TIME TEMPORARY PASSWORD (replaces any earlier one)
      // ============================================
      case 'issue-temporary-password': {
        if (!targetUserId) {
          return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        }
        const { data: target } = await adminClient.from('user_profiles').select('email, is_active').eq('id', targetUserId).single();
        if (!target) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        if (!target.is_active) {
          return NextResponse.json({ error: 'Reactivate this account first.' }, { status: 400 });
        }
        const temporaryPassword = generateTemporaryPassword();
        const { data: expiresAt, error } = await adminClient.rpc('issue_temporary_password', {
          p_user_id: targetUserId,
          p_password: temporaryPassword,
          p_created_by: auth.user.id,
          p_valid_hours: TEMP_PASSWORD_HOURS,
        });
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_ISSUE_TEMP_PASSWORD',
          details: `Admin issued a one-time temporary password for user ${targetUserId}`,
        });
        return NextResponse.json({
          success: true,
          message: 'Temporary password created.',
          data: { email: target.email, temporaryPassword, expiresAt },
        });
      }

      // ============================================
      // RESET PASSWORD (force next-login reset)
      // ============================================
      case 'reset-password': {
        if (!targetUserId) {
          return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        }

        // Get the target user email
        const { data: userRecord, error: userError } = await adminClient.auth.admin.getUserById(targetUserId);
        if (userError || !userRecord.user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Trigger password reset email redirecting to the reset-password page
        const { error } = await adminClient.auth.resetPasswordForEmail(userRecord.user.email!, {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/reset-password`,
        });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log the action
        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_RESET_PASSWORD',
          details: `Admin reset password for user ${targetUserId}`,
        });

        return NextResponse.json({
          success: true,
          message: 'Password has been reset. User will be forced to set a new password on next login.',
        });
      }

      // ============================================
      // FORCE LOGOUT (revoke refresh tokens)
      // ============================================
      case 'force-logout': {
        if (!targetUserId) {
          return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
        }

        // Ends every session and refresh token (11_user_roles_lockdown.sql).
        const { data: sessionsEnded, error } = await adminClient.rpc('force_logout_user', {
          target_user_id: targetUserId,
        });
        if (error) {
          return NextResponse.json({ error: `Could not sign the user out: ${error.message}` }, { status: 500 });
        }

        // Log the action
        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_FORCE_LOGOUT',
          details: `Admin forced logout for user ${targetUserId}`,
        });

        return NextResponse.json({
          success: true,
          sessionsEnded,
          message: `Signed out of ${sessionsEnded ?? 0} session(s). They will need to sign in again.`,
        });
      }

      // ============================================
      // ACTIVATE / DEACTIVATE USER
      // ============================================
      case 'set-status': {
        if (!targetUserId || typeof value !== 'boolean') {
          return NextResponse.json({ error: 'targetUserId and value (boolean) are required' }, { status: 400 });
        }
        if (!value && targetUserId === auth.user.id) {
          return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 });
        }

        const { error } = await adminClient
          .from('user_profiles')
          .update({ is_active: value, updated_at: new Date().toISOString() })
          .eq('id', targetUserId);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // If deactivating, also ban the user in Supabase Auth and end their sessions
        if (!value) {
          await adminClient.auth.admin.updateUserById(targetUserId, {
            ban_duration: '876000h', // ~100 years
          });
          await adminClient.rpc('force_logout_user', { target_user_id: targetUserId });
        } else {
          // Reactivate: unban
          await adminClient.auth.admin.updateUserById(targetUserId, {
            ban_duration: 'none',
          });
        }

        // Log the action
        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: value ? 'ADMIN_ACTIVATE_USER' : 'ADMIN_DEACTIVATE_USER',
          details: `Admin ${value ? 'activated' : 'deactivated'} user ${targetUserId}`,
        });

        return NextResponse.json({
          success: true,
          message: `User account has been ${value ? 'activated' : 'deactivated'}.`,
        });
      }

      // ============================================
      // UPDATE SYSTEM SETTINGS
      // ============================================
      case 'update-setting': {
        const { key: settingKey, settingValue } = body;
        if (!settingKey || settingValue === undefined) {
          return NextResponse.json({ error: 'key and settingValue are required' }, { status: 400 });
        }

        const { error } = await adminClient
          .from('system_settings')
          .update({
            value: String(settingValue),
            updated_at: new Date().toISOString(),
            updated_by: auth.user.id,
          })
          .eq('key', settingKey);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_UPDATE_SETTING',
          details: `Updated ${settingKey} to ${settingValue}`,
        });

        return NextResponse.json({ success: true, message: `Setting ${settingKey} updated.` });
      }

      // ============================================
      // GET ALL ACTIVITY LOGS (admin only)
      // ============================================
      case 'get-all-activity': {
        const { data, error } = await adminClient
          .from('user_activity_log')
          .select('*, user_profiles(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ data });
      }

      // ============================================
      // MANAGE DOCUMENT ACCESS
      // ============================================
      case 'grant-document-access': {
        const { documentId, userId: grantUserId } = body;
        if (!documentId || !grantUserId) {
          return NextResponse.json({ error: 'documentId and userId are required' }, { status: 400 });
        }

        const { error } = await adminClient
          .from('document_user_access')
          .upsert({
            document_id: documentId,
            user_id: grantUserId,
            granted_by: auth.user.id,
          });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Document access granted.' });
      }

      case 'revoke-document-access': {
        const { documentId: revokeDocId, userId: revokeUserId } = body;
        if (!revokeDocId || !revokeUserId) {
          return NextResponse.json({ error: 'documentId and userId are required' }, { status: 400 });
        }

        const { error } = await adminClient
          .from('document_user_access')
          .delete()
          .eq('document_id', revokeDocId)
          .eq('user_id', revokeUserId);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Document access revoked.' });
      }

      // ============================================
      // REGULATORY & ADVISORY MATTERS ACCESS (per person, 20_matter_access.sql):
      // value true = see everything and work on tasks; false = remove.
      // ============================================
      case 'set-matter-access': {
        if (!targetUserId || typeof value !== 'boolean') {
          return NextResponse.json({ error: 'targetUserId and value (true or false) are required' }, { status: 400 });
        }
        const { data: target } = await adminClient.from('user_profiles').select('id').eq('id', targetUserId).single();
        if (!target) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        const { error } = value
          ? await adminClient.from('matter_access_grants').upsert({ user_id: targetUserId, granted_by: auth.user.id }, { onConflict: 'user_id' })
          : await adminClient.from('matter_access_grants').delete().eq('user_id', targetUserId);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_SET_MATTER_ACCESS',
          details: `Admin ${value ? 'gave' : 'removed'} Regulatory & Advisory Matters access for user ${targetUserId}`,
        });
        return NextResponse.json({ success: true, message: value ? 'Access to Regulatory & Advisory Matters given.' : 'Access to Regulatory & Advisory Matters removed.' });
      }

      // ============================================
      // SET PROFILE PICTURE (the admin has already uploaded the file to
      // avatars/<targetUserId>/…; value is its path, or null to remove)
      // ============================================
      case 'set-avatar': {
        if (!targetUserId || !(value === null || isOwnAvatarPath(targetUserId, value))) {
          return NextResponse.json({ error: 'targetUserId and a picture in that user’s folder are required' }, { status: 400 });
        }
        if (value) {
          const folder = value.slice(0, value.lastIndexOf('/'));
          const file = value.slice(value.lastIndexOf('/') + 1);
          const { data: found } = await adminClient.storage.from(AVATAR_BUCKET).list(folder, { search: file, limit: 1 });
          if (!found?.some((f) => f.name === file)) {
            return NextResponse.json({ error: 'Upload the picture first.' }, { status: 400 });
          }
        }
        const { error } = await adminClient
          .from('user_profiles')
          .update({ avatar_path: value, updated_at: new Date().toISOString() })
          .eq('id', targetUserId);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_SET_AVATAR',
          details: `Admin ${value ? 'changed' : 'removed'} the profile picture of user ${targetUserId}`,
        });
        return NextResponse.json({ success: true, message: value ? 'Picture saved.' : 'Picture removed.' });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Admin API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
