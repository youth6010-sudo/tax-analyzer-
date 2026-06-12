import { redirect } from 'next/navigation';

export default function IntakeNewRedirect() {
  redirect('/clients/consultation/new');
}
