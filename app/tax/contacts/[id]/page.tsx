import { notFound } from 'next/navigation';
import ContactDetailView from '../../../components/ContactDetailView';
import { getContactById } from '../../../utils/contactsData';

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = getContactById(id);
  if (!contact) notFound();

  return <ContactDetailView contact={contact} />;
}
