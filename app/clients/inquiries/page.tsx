import { redirect } from 'next/navigation';

export default function InquiriesRedirect() {
  redirect('/clients/intake?tab=intake');
}
