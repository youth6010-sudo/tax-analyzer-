import { redirect } from 'next/navigation';

export default function ConsultationRedirect() {
  redirect('/clients/intake?tab=consultation');
}
