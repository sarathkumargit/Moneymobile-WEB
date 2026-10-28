-- Let every shop member (shop admin AND employees) READ all customers and
-- devices belonging to their shop. Writes stay governed by the original
-- restrictive policies (an employee can still only create/edit what they own
-- or are assigned, and no one can touch another shop's data).
-- RLS combines SELECT policies with OR, so adding these widens read only.

create policy customers_shop_read on customers
  for select using (can_access_shop(shop_id));

create policy devices_shop_read on devices
  for select using (can_access_shop(shop_id));
