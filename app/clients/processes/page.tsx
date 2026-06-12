import { redirect } from 'next/navigation';

export default function ProcessesRedirect() {
  redirect('/clients/intake?tab=intake');
}
