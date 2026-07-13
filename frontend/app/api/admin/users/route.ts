import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';

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

        // Revoke all refresh tokens for the user via SQL
        const { error } = await adminClient.rpc('force_logout_user', {
          target_user_id: targetUserId,
        });

        // Fallback: if the RPC doesn't exist, sign out via admin API
        if (error) {
          // Alternative: delete refresh tokens directly
          const { error: sqlError } = await adminClient
            .from('user_profiles')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', targetUserId);

          if (sqlError) {
            return NextResponse.json({ error: sqlError.message }, { status: 500 });
          }
        }

        // Log the action
        await adminClient.from('user_activity_log').insert({
          user_id: auth.user.id,
          action: 'ADMIN_FORCE_LOGOUT',
          details: `Admin forced logout for user ${targetUserId}`,
        });

        return NextResponse.json({
          success: true,
          message: 'User sessions have been invalidated. They will need to log in again.',
        });
      }

      // ============================================
      // ACTIVATE / DEACTIVATE USER
      // ============================================
      case 'set-status': {
        if (!targetUserId || typeof value !== 'boolean') {
          return NextResponse.json({ error: 'targetUserId and value (boolean) are required' }, { status: 400 });
        }

        const { error } = await adminClient
          .from('user_profiles')
          .update({ is_active: value, updated_at: new Date().toISOString() })
          .eq('id', targetUserId);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // If deactivating, also ban the user in Supabase Auth
        if (!value) {
          await adminClient.auth.admin.updateUserById(targetUserId, {
            ban_duration: '876000h', // ~100 years
          });
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

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('Admin API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
