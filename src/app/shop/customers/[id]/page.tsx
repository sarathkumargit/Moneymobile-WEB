import { CustomerDetail } from "@/components/customer-detail";
export const dynamic = "force-dynamic";
export default function Page({ params }: { params: { id: string } }) {
  return <CustomerDetail id={params.id} backHref="/shop/customers" />;
}
