import { redirect } from 'next/navigation';

// Accounts are created only by an EPDH admin, for listed @excredite.ng addresses
// (see 18_allowed_accounts.sql), so there is no self sign-up.
export default function SignupPage() {
  redirect('/login');
}
